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
      
      // Add the user's message to the thread
      await this.openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: message
      });
      
      // Run the assistant
      const run = await this.openai.beta.threads.runs.create(threadId, {
        assistant_id: this.assistantId
      });
      
      // Wait for the assistant to complete
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
        return latestMessage.content[0].text.value;
      }
      
      throw new Error('No assistant response found');
      
    } catch (error) {
      console.error('Error in sendMessage:', error);
      throw error;
    }
  }
}

module.exports = AssistantService;
