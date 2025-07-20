const { OpenAI } = require('openai');

class AssistantService {
  constructor(pool) {
    this.openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
    this.pool = pool;
    this.assistantId = process.env.ARIA_ASSISTANT_ID; // We'll set this
  }

  async getOrCreateThread(userId) {
    try {
      // Check if user already has a thread
      const result = await this.pool.query(
        'SELECT thread_id FROM user_threads WHERE user_id = $1',
        [userId]
      );
      
      if (result.rows[0]) {
        console.log(`Found existing thread for user ${userId}`);
        return result.rows[0].thread_id;
      }
      
      // Create new thread for new user
      console.log(`Creating new thread for user ${userId}`);
      const thread = await this.openai.beta.threads.create();
      
      // Save the mapping
      await this.pool.query(
        'INSERT INTO user_threads (user_id, thread_id, created_at) VALUES ($1, $2, NOW())',
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
          await this.openai.beta.threads.messages.create(threadId, {
            role: 'user',
            content: contextMessage
          });
        }
      }

      // Send the actual user message
      await this.openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: message
      });

      // Increment message count
      await this.markThreadInitialized(userId);

      // Run the assistant
      const run = await this.openai.beta.threads.runs.create(threadId, {
        assistant_id: this.assistantId
      });

      // Wait for completion
      let runStatus = await this.openai.beta.threads.runs.retrieve(threadId, run.id);

      while (runStatus.status !== 'completed') {
        if (runStatus.status === 'failed') {
          throw new Error('Assistant run failed');
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await this.openai.beta.threads.runs.retrieve(threadId, run.id);
      }

      // Get the assistant's response
      const messages = await this.openai.beta.threads.messages.list(threadId);
      const latestMessage = messages.data[0];

      if (latestMessage.role === 'assistant') {
        // Update last message timestamp
        await this.pool.query(
          'UPDATE user_threads SET last_message = NOW() WHERE user_id = $1',
          [userId]
        );

        return latestMessage.content[0].text.value;
      }

      throw new Error('No assistant response found');

    } catch (error) {
      console.error('Error in sendMessage:', error);
      throw error;
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

  async markThreadInitialized(userId) {
    await this.pool.query(
      'UPDATE user_threads SET message_count = message_count + 1 WHERE user_id = $1',
      [userId]
    );
  }
}

module.exports = AssistantService;
