const { OpenAI } = require('openai');

class AssistantService {
  constructor(pool) {
    this.pool = pool;
    this.assistantId = process.env.ARIA_ASSISTANT_ID;
    
    if (!this.assistantId) {
      throw new Error('ARIA_ASSISTANT_ID not found in environment variables');
    }
    
    this.openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
    
    // Retry configuration
    this.maxRetries = 3;
    this.retryDelay = 1000; // Start with 1 second
  }

  async getOrCreateThread(userId) {
    try {
      // Check if user already has a thread
      const result = await this.pool.query(
        'SELECT thread_id FROM user_threads WHERE user_id = $1',
        [userId]
      );
      
      if (result.rows[0]) {
        console.log(`Found existing thread for user ${userId}: ${result.rows[0].thread_id}`);
        return result.rows[0].thread_id;
      }
      
      // Create new thread for new user
      console.log(`Creating new thread for user ${userId}`);
      const thread = await this.retryOperation(async () => {
        return await this.openai.beta.threads.create();
      });
      
      // Save the mapping
      await this.pool.query(
        'INSERT INTO user_threads (user_id, thread_id, created_at, message_count) VALUES ($1, $2, NOW(), 0)',
        [userId, thread.id]
      );
      
      console.log(`Created thread ${thread.id} for user ${userId}`);
      return thread.id;
      
    } catch (error) {
      console.error('Error in getOrCreateThread:', error);
      throw error;
    }
  }

  async sendMessage(userId, message) {
    try {
      const threadId = await this.getOrCreateThread(userId);

      // Check if this is a brand new thread
      const isNewThread = await this.isNewThread(userId);

      if (isNewThread) {
        // Get user details from database
        const user = await this.getUserDetails(userId);

        if (user) {
          const contextMessage = `[USER CONTEXT: ${user.user_name}, ${user.age}, ${user.user_gender}]`;

          // Send context first
          await this.retryOperation(async () => {
            return await this.openai.beta.threads.messages.create(threadId, {
              role: 'user',
              content: contextMessage
            });
          });
          
          console.log(`Sent context for new user ${userId}`);
        }
      }

      // Send the actual user message
      await this.retryOperation(async () => {
        return await this.openai.beta.threads.messages.create(threadId, {
          role: 'user',
          content: message
        });
      });

      // Increment message count
      await this.incrementMessageCount(userId);

      // Run the assistant
      const run = await this.retryOperation(async () => {
        return await this.openai.beta.threads.runs.create(threadId, {
          assistant_id: this.assistantId
        });
      });

      // Wait for completion with timeout
      const response = await this.waitForRunCompletion(threadId, run.id);

      // Update last message timestamp
      await this.pool.query(
        'UPDATE user_threads SET last_message = NOW() WHERE user_id = $1',
        [userId]
      );

      return response;

    } catch (error) {
      console.error('Error in sendMessage:', error);
      throw error;
    }
  }

  async waitForRunCompletion(threadId, runId, maxWaitTime = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const runStatus = await this.retryOperation(async () => {
        return await this.openai.beta.threads.runs.retrieve(threadId, runId);
      });

      if (runStatus.status === 'completed') {
        // Get the assistant's response
        const messages = await this.retryOperation(async () => {
          return await this.openai.beta.threads.messages.list(threadId, {
            limit: 1
          });
        });
        
        const latestMessage = messages.data[0];

        if (latestMessage && latestMessage.role === 'assistant') {
          return latestMessage.content[0]?.text?.value || 'I understand.';
        }
        
        throw new Error('No assistant response found');
      }
      
      if (runStatus.status === 'failed') {
        console.error('Assistant run failed:', runStatus);
        throw new Error(`Assistant run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
      }
      
      if (runStatus.status === 'cancelled') {
        throw new Error('Assistant run was cancelled');
      }
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Assistant run timed out');
  }

  async getRecentMessages(threadId, limit = 20) {
    try {
      const messages = await this.retryOperation(async () => {
        return await this.openai.beta.threads.messages.list(threadId, {
          limit: limit
        });
      });
      
      // Return in chronological order
      return messages.data.reverse();
    } catch (error) {
      console.error('Error getting recent messages:', error);
      return [];
    }
  }

  async isNewThread(userId) {
    const result = await this.pool.query(
      'SELECT message_count FROM user_threads WHERE user_id = $1',
      [userId]
    );
    return result.rows[0]?.message_count === 0;
  }

  async getUserDetails(userId) {
    const result = await this.pool.query(
      'SELECT user_name, age, user_gender FROM users WHERE user_id = $1',
      [userId]
    );
    return result.rows[0];
  }

  async incrementMessageCount(userId) {
    await this.pool.query(
      'UPDATE user_threads SET message_count = message_count + 1 WHERE user_id = $1',
      [userId]
    );
  }

  // Retry helper with exponential backoff
  async retryOperation(operation, attempt = 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= this.maxRetries) {
        console.error(`Operation failed after ${this.maxRetries} attempts:`, error);
        throw error;
      }
      
      // Check if error is retryable
      const isRetryable = error.status === 429 || // Rate limit
                         error.status === 500 || // Server error
                         error.status === 502 || // Bad gateway
                         error.status === 503 || // Service unavailable
                         error.status === 504 || // Gateway timeout
                         error.code === 'ECONNRESET' ||
                         error.code === 'ETIMEDOUT';
      
      if (!isRetryable) {
        throw error;
      }
      
      const delay = this.retryDelay * Math.pow(2, attempt - 1);
      console.log(`Retrying operation in ${delay}ms (attempt ${attempt}/${this.maxRetries})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryOperation(operation, attempt + 1);
    }
  }

  // Health check method
  async healthCheck() {
    try {
      // Try to retrieve assistant to verify connection
      await this.openai.beta.assistants.retrieve(this.assistantId);
      return { healthy: true, message: 'Assistant API connected' };
    } catch (error) {
      return { healthy: false, message: error.message };
    }
  }
}

module.exports = AssistantService;
