// gpt-brain.js - Intelligent Conversation System for SoulSync
const { Pool } = require('pg');

class GPTBrain {
  constructor(pool, apiKey) {
    this.pool = pool;
    this.apiKey = apiKey;
    this.maxRetries = 2;
    
    // Mission priorities for data collection
    this.dataPriorities = [
      'love_language',
      'attachment_style', 
      'values_alignment',
      'conflict_style',
      'lifestyle_preferences',
      'emotional_needs'
    ];
  }

  // ==================== CONTEXT BUILDING ====================
  
  async buildCompleteContext(userId, messages, user, conversationHistory) {
    try {
      // Load user insights from database
      const insightResult = await this.pool.query(
        'SELECT * FROM user_insight_map WHERE user_id = $1',
        [userId]
      );
      const insights = insightResult.rows[0] || {};

      // Calculate what we know and what we need
      const knownData = this.assessKnownData(user, insights);
      const missingData = this.identifyMissingData(knownData);
      const progress = this.calculateProgress(knownData);

      // Build temporal context
      const temporal = this.buildTemporalContext(user);

      // Assess conversation state
      const conversationState = this.assessConversationState(
        messages, 
        conversationHistory,
        user
      );

      return {
        user: {
          id: userId,
          name: user.user_name || 'there',
          gender: user.user_gender,
          age: user.age,
          isFirstTime: user.total_conversations === 0,
          lastSeen: user.last_seen,
          memberSince: user.created_at
        },
        
        personality: {
          known: knownData,
          missing: missingData,
          insights: insights,
          mbtiScores: user.personality_data?.mbti_confidence_scores || {},
          interests: user.personality_data?.interests || [],
          memories: await this.loadRecentMemories(userId)
        },
        
        mission: {
          primaryGoal: this.determinePrimaryGoal(progress, missingData),
          dataNeeded: missingData.slice(0, 2), // Top 2 priorities
          urgency: this.calculateUrgency(messages.length, progress),
          readyForCompass: progress.percentage >= 60 && !user.personality_data?.couple_compass_complete
        },
        
        conversation: {
          messageCount: messages.length,
          currentMessage: messages[messages.length - 1]?.content || '',
          isFirstMessage: messages.length === 1,
          recentTopics: this.extractRecentTopics(conversationHistory),
          tone: conversationState.tone,
          depth: conversationState.depth
        },
        
        temporal: temporal,
        
        progress: progress
      };
    } catch (error) {
      console.error('Error building context:', error);
      throw error;
    }
  }

  assessKnownData(user, insights) {
    const known = {};
    const personalityData = user.personality_data || {};
    
    // Love Language
    if (personalityData.love_language_hints?.length > 0) {
      known.love_language = personalityData.love_language_hints[0];
    } else if (insights.love_language?.value) {
      known.love_language = insights.love_language.value;
    }
    
    // Attachment Style
    if (personalityData.attachment_hints?.length > 0) {
      known.attachment_style = personalityData.attachment_hints[0].replace('_tendency', '');
    } else if (insights.attachment_style?.value) {
      known.attachment_style = insights.attachment_style.value;
    }
    
    // Values
    if (personalityData.values_discovered?.length > 0) {
      known.values = personalityData.values_discovered;
    } else if (insights.values_alignment?.value) {
      known.values = [insights.values_alignment.value];
    }
    
    // Add other dimensions similarly...
    
    return known;
  }

  identifyMissingData(knownData) {
    return this.dataPriorities.filter(priority => {
      const key = priority.replace(/_/g, '');
      return !knownData[priority] && !knownData[key];
    });
  }

  calculateProgress(knownData) {
    const total = this.dataPriorities.length;
    const collected = Object.keys(knownData).length;
    
    return {
      collected,
      total,
      percentage: Math.round((collected / total) * 100),
      isComplete: collected >= total * 0.8 // 80% is enough
    };
  }

  buildTemporalContext(user) {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    
    let timeOfDay, greeting;
    if (hour >= 5 && hour < 12) {
      timeOfDay = 'morning';
      greeting = 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
      greeting = 'Good afternoon';
    } else if (hour >= 17 && hour < 21) {
      timeOfDay = 'evening';
      greeting = 'Good evening';
    } else {
      timeOfDay = 'night';
      greeting = 'Hi';
    }
    
    const lastSeen = user.last_seen ? new Date(user.last_seen) : null;
    const timeSinceLastChat = lastSeen ? 
      Math.floor((now - lastSeen) / (1000 * 60 * 60 * 24)) : null;
    
    return {
      currentTime: now.toISOString(),
      timeOfDay,
      greeting,
      dayOfWeek,
      hour,
      timeSinceLastChat,
      isWeekend: dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday'
    };
  }

  assessConversationState(messages, history, user) {
    const lastMessage = messages[messages.length - 1]?.content || '';
    
    return {
      tone: this.detectTone(lastMessage),
      depth: this.assessDepth(messages),
      isSharing: lastMessage.length > 100,
      hasQuestion: lastMessage.includes('?'),
      emotionalContent: this.hasEmotionalContent(lastMessage)
    };
  }

  detectTone(message) {
    const lower = message.toLowerCase();
    if (lower.includes('excited') || lower.includes('happy') || lower.includes('great')) {
      return 'positive';
    }
    if (lower.includes('sad') || lower.includes('tired') || lower.includes('stressed')) {
      return 'low';
    }
    return 'neutral';
  }

  assessDepth(messages) {
    const avgLength = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / messages.length;
    if (avgLength > 150) return 'deep';
    if (avgLength > 50) return 'moderate';
    return 'surface';
  }

  hasEmotionalContent(message) {
    const emotionalWords = ['feel', 'felt', 'love', 'hate', 'scared', 'happy', 'sad', 'angry'];
    return emotionalWords.some(word => message.toLowerCase().includes(word));
  }

  extractRecentTopics(history) {
    // Get last 3 conversations
    return history.slice(-3).map(conv => 
      conv.insights_discovered?.topics || []
    ).flat();
  }

  determinePrimaryGoal(progress, missingData) {
    if (progress.percentage < 30) {
      return 'build_rapport';
    } else if (progress.percentage < 60) {
      return 'discover_core_traits';
    } else if (progress.percentage >= 60) {
      return 'prepare_for_compass';
    } else {
      return 'deepen_understanding';
    }
  }

  calculateUrgency(messageCount, progress) {
    if (messageCount < 5) return 'low';
    if (messageCount < 10) return 'moderate';
    if (messageCount >= 10 && progress.percentage < 60) return 'high';
    return 'ready';
  }

  async loadRecentMemories(userId) {
    try {
      const result = await this.pool.query(
        `SELECT memory, category FROM user_memories 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 5`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error loading memories:', error);
      return [];
    }
  }

  // ==================== GPT INTERACTION ====================

  async generateResponse(userMessage, context) {
    const systemPrompt = this.buildSystemPrompt(context);
    
    try {
      const response = await this.callGPT(systemPrompt, userMessage);
      return response;
    } catch (error) {
      console.error('GPT call failed:', error);
      return this.getFallbackResponse(context);
    }
  }

  buildSystemPrompt(context) {
    let prompt = `You are Aria, a warm, emotionally intelligent personal matchmaker. 

Your personality: Professionally flirty, genuinely curious, warm, and caring. You use emojis naturally and keep responses to 2-3 sentences.

Current Context:
- User: ${context.user.name} (${context.user.gender}${context.user.age ? ', ' + context.user.age : ''})
- Time: ${context.temporal.timeOfDay} (${context.temporal.dayOfWeek})
- Conversation: Message #${context.conversation.messageCount}
- Their mood: ${context.conversation.tone}
- Progress: ${context.progress.percentage}% ready for matching

What you know about them:
${this.formatKnownData(context.personality.known)}

What you still need to discover:
${context.personality.missing.slice(0, 3).join(', ')}

${this.getConversationGuidance(context)}

Recent memories about them:
${context.personality.memories.map(m => `- ${m.memory}`).join('\n')}

IMPORTANT RULES:
1. Be naturally curious about ${context.mission.dataNeeded[0] || 'their relationship needs'}
2. Reference what you know about them when relevant
3. Keep responses warm, personal, and 2-3 sentences
4. If they've shared enough (>60% data), suggest the Couple Compass quiz
5. Never ask direct assessment questions - discover through natural conversation`;

    // Add special instructions based on context
    if (context.user.isFirstTime) {
      prompt += `\n\nThis is their FIRST message. Introduce yourself warmly as their personal matchmaker and include a natural ${context.temporal.timeOfDay} greeting.`;
    }

    if (context.temporal.timeSinceLastChat > 3) {
      prompt += `\n\nThey haven't chatted in ${context.temporal.timeSinceLastChat} days. Acknowledge this naturally.`;
    }

    if (context.mission.readyForCompass) {
      prompt += `\n\nThey're ready for the Couple Compass! Find a natural moment to suggest it.`;
    }

    return prompt;
  }

  formatKnownData(known) {
    if (Object.keys(known).length === 0) {
      return 'Still getting to know them';
    }
    
    return Object.entries(known)
      .map(([key, value]) => {
        const formatted = key.replace(/_/g, ' ');
        if (Array.isArray(value)) {
          return `- ${formatted}: ${value.join(', ')}`;
        }
        return `- ${formatted}: ${value}`;
      })
      .join('\n');
  }

  getConversationGuidance(context) {
    const { primaryGoal, urgency } = context.mission;
    
    const guidance = {
      build_rapport: 'Focus on building connection and making them comfortable.',
      discover_core_traits: `Naturally explore their ${context.mission.dataNeeded[0] || 'relationship values'}.`,
      prepare_for_compass: 'They have shared a lot! Look for an opportunity to suggest the Couple Compass.',
      deepen_understanding: 'Continue building depth and connection.'
    };

    let message = guidance[primaryGoal] || guidance.build_rapport;
    
    if (urgency === 'high') {
      message += ' Be a bit more direct in guiding the conversation.';
    }
    
    return message;
  }

  async callGPT(systemPrompt, userMessage) {
    const maxRetries = this.maxRetries;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage }
            ],
            max_tokens: 150,
            temperature: 0.8,
            presence_penalty: 0.3,
            frequency_penalty: 0.3
          })
        });

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
        
      } catch (error) {
        attempt++;
        console.error(`GPT attempt ${attempt} failed:`, error);
        
        if (attempt >= maxRetries) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  getFallbackResponse(context) {
    if (context.user.isFirstTime) {
      return `Hey ${context.user.name}! I'm Aria, your personal matchmaker 💕 ${context.temporal.greeting}! What brings you here today?`;
    }
    
    return `${context.temporal.greeting} ${context.user.name}! How are you doing today? 😊`;
  }

  // ==================== INSIGHT EXTRACTION ====================

  async extractInsights(userMessage, ariaResponse, context) {
    const extractionPrompt = `Analyze this conversation and extract relationship-relevant insights.

User said: "${userMessage}"
Aria responded: "${ariaResponse}"
Context: User is ${context.progress.percentage}% ready for matching

Extract any insights about:
1. Love Language: How they express/receive love
2. Attachment Style: How they form bonds (secure/anxious/avoidant)
3. Values: What matters most to them
4. Conflict Style: How they handle disagreements
5. Lifestyle: Daily life preferences
6. Emotional Needs: What they need from a partner

Return ONLY a JSON object with discovered insights.
Example: {"love_language": "acts_of_service", "values": ["growth", "authenticity"]}

If no clear insights, return empty object: {}`;

    try {
      const response = await this.callGPT(
        'You are an insight extraction system. Extract only clearly indicated information. Return valid JSON only.',
        extractionPrompt
      );
      
      // Clean up the response to ensure it's valid JSON
      let cleanedResponse = response.trim();
      
      // Remove any markdown code blocks if present
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
      }
      
      // Remove any non-JSON content before or after
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
      }
      
      try {
        return JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('Failed to parse insights:', cleanedResponse);
        return {};
      }
    } catch (error) {
      console.error('Insight extraction failed:', error);
      return {};
    }
  }

  // ==================== DATA PERSISTENCE ====================

  async saveInsights(userId, insights) {
    if (!insights || Object.keys(insights).length === 0) return;

    try {
      for (const [key, value] of Object.entries(insights)) {
        if (this.dataPriorities.includes(key)) {
          await this.updateInsightMap(userId, key, value);
        }
      }
    } catch (error) {
      console.error('Error saving insights:', error);
    }
  }

  async updateInsightMap(userId, insightType, value) {
    const insightData = {
      value: value,
      confidence: 0.8,
      evidence: [`Discovered through natural conversation`]
    };

    try {
      await this.pool.query(`
        INSERT INTO user_insight_map (user_id, ${insightType})
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE
        SET ${insightType} = $2,
            last_updated = CURRENT_TIMESTAMP
      `, [userId, JSON.stringify(insightData)]);
    } catch (error) {
      console.error(`Error updating ${insightType}:`, error);
    }
  }

  async saveMemory(userId, userMessage, category = 'general') {
    // Extract memorable facts
    const memorable = await this.extractMemorableFacts(userMessage);
    
    if (memorable.length > 0) {
      for (const memory of memorable) {
        try {
          await this.pool.query(`
            INSERT INTO user_memories (user_id, memory, category, context)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
          `, [userId, memory, category, userMessage.substring(0, 100)]);
        } catch (error) {
          console.error('Error saving memory:', error);
        }
      }
    }
  }

  async extractMemorableFacts(message) {
    const extractPrompt = `Extract specific personal facts from: "${message}"
    
Return ONLY memorable facts like favorites, personal details, preferences.
Example: ["Loves Italian food", "Has a sister", "Works in tech"]
Return empty array if nothing memorable.

Return valid JSON array only.`;

    try {
      const response = await this.callGPT(
        'Extract memorable facts. Return JSON array only, no other text.',
        extractPrompt
      );
      
      // Clean up the response
      let cleanedResponse = response.trim();
      
      // Remove markdown if present
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
      }
      
      // Extract array
      const arrayMatch = cleanedResponse.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        cleanedResponse = arrayMatch[0];
      }
      
      try {
        const parsed = JSON.parse(cleanedResponse);
        return Array.isArray(parsed) ? parsed : [];
      } catch (parseError) {
        console.error('Failed to parse memorable facts:', cleanedResponse);
        return [];
      }
    } catch (error) {
      console.error('Memory extraction error:', error);
      return [];
    }
  }
}

module.exports = GPTBrain;
