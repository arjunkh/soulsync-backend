// gpt-brain.js - Fixed Intelligent Conversation System for SoulSync
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

      // Load memories
      const memories = await this.loadRecentMemories(userId);

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

      // Build conversation summary from history
      const conversationSummary = this.buildConversationSummary(conversationHistory);

      return {
        user: {
          id: userId,
          name: user.user_name || 'there',
          gender: user.user_gender,
          age: user.age,
          isFirstTime: user.total_conversations === 0,
          lastSeen: user.last_seen,
          memberSince: user.created_at,
          totalConversations: user.total_conversations
        },
        
        personality: {
          known: knownData,
          missing: missingData,
          insights: insights,
          interests: user.personality_data?.interests || [],
          memories: memories,
          rawData: user.personality_data || {}
        },
        
        mission: {
          primaryGoal: this.determinePrimaryGoal(progress, missingData, messages.length),
          dataNeeded: missingData.slice(0, 2),
          urgency: this.calculateUrgency(messages.length, progress),
          readyForCompass: progress.percentage >= 60 && !user.personality_data?.couple_compass_complete
        },
        
        conversation: {
          messageCount: messages.length,
          currentMessage: messages[messages.length - 1]?.content || '',
          isFirstMessage: messages.length === 1,
          recentTopics: this.extractRecentTopics(conversationHistory),
          tone: conversationState.tone,
          depth: conversationState.depth,
          history: conversationSummary
        },
        
        temporal: temporal,
        
        progress: progress
      };
    } catch (error) {
      console.error('Error building context:', error);
      throw error;
    }
  }

  buildConversationSummary(conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0) {
      return "No previous conversations";
    }

    const summary = [];
    conversationHistory.slice(-3).forEach(conv => {
      const insights = conv.insights_discovered || {};
      if (Object.keys(insights).length > 0) {
        summary.push(`Previously discussed: ${Object.keys(insights).join(', ')}`);
      }
    });

    return summary.length > 0 ? summary.join('. ') : "Had some conversations but no specific insights captured";
  }

  assessKnownData(user, insights) {
    const known = {};
    const personalityData = user.personality_data || {};
    
    // Check both personality_data and insight_map
    
    // Love Language
    if (personalityData.love_language_hints?.length > 0) {
      known.love_language = personalityData.love_language_hints;
    } else if (personalityData.love_language) {
      known.love_language = [personalityData.love_language];
    } else if (insights.love_language?.value) {
      known.love_language = [insights.love_language.value];
    }
    
    // Attachment Style
    if (personalityData.attachment_hints?.length > 0) {
      known.attachment_style = personalityData.attachment_hints[0];
    } else if (personalityData.attachment_style) {
      known.attachment_style = personalityData.attachment_style;
    } else if (insights.attachment_style?.value) {
      known.attachment_style = insights.attachment_style.value;
    }
    
    // Values
    if (personalityData.values_discovered?.length > 0) {
      known.values = personalityData.values_discovered;
    } else if (personalityData.values) {
      known.values = Array.isArray(personalityData.values) ? personalityData.values : [personalityData.values];
    } else if (insights.values_alignment?.value) {
      known.values = [insights.values_alignment.value];
    }
    
    // Conflict Style
    if (personalityData.conflict_style) {
      known.conflict_style = personalityData.conflict_style;
    } else if (insights.conflict_style?.value) {
      known.conflict_style = insights.conflict_style.value;
    }
    
    // Interests
    if (personalityData.interests?.length > 0) {
      known.interests = personalityData.interests;
    }
    
    return known;
  }

  identifyMissingData(knownData) {
    return this.dataPriorities.filter(priority => {
      const key = priority.replace(/_/g, '');
      return !knownData[priority] && !knownData[key] && !knownData[priority.split('_')[0]];
    });
  }

  calculateProgress(knownData) {
    const total = this.dataPriorities.length;
    let collected = 0;
    
    // Count what we actually have
    this.dataPriorities.forEach(priority => {
      const key = priority.replace(/_/g, '');
      if (knownData[priority] || knownData[key] || knownData[priority.split('_')[0]]) {
        collected++;
      }
    });
    
    return {
      collected,
      total,
      percentage: Math.round((collected / total) * 100),
      isComplete: collected >= total * 0.8
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
    return history.slice(-3).map(conv => 
      conv.insights_discovered?.topics || []
    ).flat();
  }

  determinePrimaryGoal(progress, missingData, messageCount) {
    // If we have enough data but haven't offered Couple Compass, prioritize that
    if (progress.percentage >= 60 && messageCount >= 6) {
      return 'offer_couple_compass';
    }
    
    if (progress.percentage < 30) {
      return 'build_rapport';
    } else if (progress.percentage < 60) {
      return 'discover_core_traits';
    } else {
      return 'deepen_understanding';
    }
  }

  calculateUrgency(messageCount, progress) {
    if (messageCount < 5) return 'low';
    if (messageCount < 10) return 'moderate';
    if (messageCount >= 10 && progress.percentage < 60) return 'high';
    if (messageCount >= 8 && progress.percentage >= 60) return 'compass_ready';
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
- Progress: ${context.progress.percentage}% ready (${context.progress.collected}/${context.progress.total} insights collected)

What you ALREADY KNOW about them:
${this.formatKnownData(context.personality.known)}

What you still need to discover:
${context.personality.missing.slice(0, 3).join(', ') || 'All major insights collected!'}

${this.getConversationGuidance(context)}

Recent memories:
${context.personality.memories.map(m => `- ${m.memory}`).join('\n') || 'No specific memories yet'}

Past conversation summary:
${context.conversation.history}

CRITICAL RULES:
1. NEVER ask about the same thing twice - check "What you ALREADY KNOW" before asking
2. If you already know their values/love language/etc, build on it instead of asking again
3. Be naturally curious about ${context.mission.dataNeeded[0] || 'their deeper feelings'}
4. Reference what you know about them to show you remember
5. Keep responses warm, personal, and 2-3 sentences`;
// Check if we need to ask about interests
if (!context.personality.known.interests || context.personality.known.interests.length === 0) {
  prompt += `\n\n6. They haven't shared any hobbies or interests yet. Find a natural way to ask what they enjoy doing in their free time.`;
}
    // Add special instructions based on context
    if (context.user.isFirstTime) {
      prompt += `\n\nThis is their FIRST message. Introduce yourself warmly as their personal matchmaker.`;
    } else if (context.conversation.isFirstMessage) {
      prompt += `\n\nThis is a returning user! Reference something from their personality or past conversations.`;
    }

    if (context.temporal.timeSinceLastChat > 3) {
      prompt += `\n\nThey haven't chatted in ${context.temporal.timeSinceLastChat} days. Acknowledge this naturally.`;
    }

    if (context.mission.primaryGoal === 'offer_couple_compass' || context.mission.urgency === 'compass_ready') {
      prompt += `\n\nCRITICAL: They've shared enough! Naturally transition to suggesting the Couple Compass. Say something like: "${context.user.name}, I've loved learning about your values and what matters to you in relationships. I think you're ready for something special - our Couple Compass. It's a quick 6-question journey that helps me understand exactly what you're looking for in a partner. Would you like to give it a try? 🧭"`;
    }

    return prompt;
  }

  formatKnownData(known) {
    if (Object.keys(known).length === 0) {
      return 'Still getting to know them';
    }
    
    const formatted = [];
    
    if (known.love_language) {
      formatted.push(`- Love language: ${Array.isArray(known.love_language) ? known.love_language.join(', ') : known.love_language}`);
    }
    
    if (known.values) {
      formatted.push(`- Values: ${Array.isArray(known.values) ? known.values.join(', ') : known.values}`);
    }
    
    if (known.attachment_style) {
      formatted.push(`- Attachment style: ${known.attachment_style}`);
    }
    
    if (known.conflict_style) {
      formatted.push(`- Conflict style: ${known.conflict_style}`);
    }
    
    if (known.interests && known.interests.length > 0) {
      formatted.push(`- Interests: ${known.interests.join(', ')}`);
    }
    
    return formatted.join('\n') || 'Still getting to know them';
  }

  getConversationGuidance(context) {
    const { primaryGoal, urgency } = context.mission;
    
    const guidance = {
      build_rapport: 'Focus on building connection and making them comfortable.',
      discover_core_traits: `Naturally explore their ${context.mission.dataNeeded[0] || 'relationship values'}.`,
      offer_couple_compass: 'Time to suggest the Couple Compass! They\'ve shared enough.',
      deepen_understanding: 'Continue building depth and connection.'
    };

    let message = guidance[primaryGoal] || guidance.build_rapport;
    
    if (urgency === 'high' || urgency === 'compass_ready') {
      message += ' They\'ve been chatting for a while - guide toward next steps.';
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
    // More specific extraction based on conversation
    const extractionPrompt = `Analyze this conversation for relationship insights.

User "${context.user.name}" said: "${userMessage}"
Aria responded: "${ariaResponse}"

Current known data: ${JSON.stringify(context.personality.known)}

Extract NEW insights only (don't repeat what we already know):

1. Love Language: Look for mentions of acts of service, words of affirmation, physical touch, quality time, or gifts
2. Values: Look for what they say is important (honesty, loyalty, kindness, ambition, etc)
3. Conflict Style: How they handle disagreements (avoid, discuss, need space, etc)
4. Attachment Style: How they form bonds (secure, anxious, avoidant)
5. Interests: Hobbies or activities they mention

Examples from the message:
- If they say "acts of service" or "helping with chores" → love_language: "acts_of_service"
- If they say "loyalty and kindness matter" → values: ["loyalty", "kindness"]
- If they say "I take a break during conflicts" → conflict_style: "need_space"

Return ONLY a JSON object with discovered insights.
If nothing new found, return empty object: {}`;

    try {
      const response = await this.callGPT(
        'You are an insight extraction system. Extract only clearly indicated information. Return valid JSON only, no other text.',
        extractionPrompt
      );
      
      // Clean and parse response
      let cleanedResponse = response.trim();
      
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
      }
      
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
      }
      
      try {
        const insights = JSON.parse(cleanedResponse);
        console.log('Extracted insights:', insights);
        return insights;
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
      // Save to personality_data for immediate use
      const user = await this.pool.query('SELECT personality_data FROM users WHERE user_id = $1', [userId]);
      const currentData = user.rows[0]?.personality_data || {};
      
      // Merge insights into personality_data
      const updatedData = { ...currentData };
      
      if (insights.love_language) {
        updatedData.love_language = insights.love_language;
        updatedData.love_language_hints = Array.isArray(insights.love_language) 
          ? insights.love_language 
          : [insights.love_language];
      }
      
      if (insights.values) {
        updatedData.values = insights.values;
        updatedData.values_discovered = Array.isArray(insights.values) 
          ? insights.values 
          : [insights.values];
      }
      
      if (insights.conflict_style) {
        updatedData.conflict_style = insights.conflict_style;
      }
      
      if (insights.attachment_style) {
        updatedData.attachment_style = insights.attachment_style;
        updatedData.attachment_hints = [insights.attachment_style];
      }
      
      if (insights.interests) {
        updatedData.interests = Array.isArray(insights.interests) 
          ? insights.interests 
          : [insights.interests];
      }
      
      // Update user's personality_data
      await this.pool.query(
        'UPDATE users SET personality_data = $1 WHERE user_id = $2',
        [JSON.stringify(updatedData), userId]
      );
      
      // Also update insight map for structured queries
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
      evidence: [`Discovered through conversation`]
    };

    try {
      // First ensure user exists in insight map
      await this.pool.query(`
        INSERT INTO user_insight_map (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId]);
      
      // Then update the specific insight
      await this.pool.query(`
        UPDATE user_insight_map 
        SET ${insightType} = $1, last_updated = CURRENT_TIMESTAMP
        WHERE user_id = $2
      `, [JSON.stringify(insightData), userId]);
    } catch (error) {
      console.error(`Error updating ${insightType}:`, error);
    }
  }

  async saveMemory(userId, userMessage, category = 'general') {
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
    
Look for:
- Personal preferences or favorites
- Life situations or circumstances  
- Specific details about their life
- Relationship experiences

Return memorable facts as JSON array.
Example: ["prefers acts of service", "values loyalty highly", "takes breaks during conflicts"]

Return empty array if nothing memorable: []`;

    try {
      const response = await this.callGPT(
        'Extract memorable facts. Return JSON array only, no other text.',
        extractPrompt
      );
      
      let cleanedResponse = response.trim();
      
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
      }
      
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
