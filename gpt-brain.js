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

      // Ensure couple_compass_data is available in user object
      if (!user.couple_compass_data && user.personality_data?.couple_compass_data) {
        user.couple_compass_data = user.personality_data.couple_compass_data;
      }

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
          totalConversations: user.total_conversations,
          couple_compass_data: user.couple_compass_data
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
          primaryGoal: this.determinePrimaryGoal(progress, missingData, messages.length, knownData),
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
          frustrated: conversationState.frustrated,
          engagement: conversationState.engagement,
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

    // Check Couple Compass completion
    if (
      personalityData.couple_compass_complete ||
      Object.keys(user.couple_compass_data || {}).length >= 6
    ) {
      known.couple_compass_complete = true;
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
    const previousMessage = messages[messages.length - 2]?.content || '';

    // Detect frustration patterns
    const frustrationSignals = [
      'i already told you',
      'i just said',
      'as i mentioned',
      'done and done',
      'we already',
      'i answered that',
      'check again'
    ];

    const isUserFrustrated = frustrationSignals.some(signal =>
      lastMessage.toLowerCase().includes(signal)
    );

    // Detect engagement level
    const shortResponses = messages.slice(-3).filter(m =>
      m.role === 'user' && m.content.length < 20
    ).length;

    const engagement = shortResponses >= 2 ? 'disengaging' : 'engaged';

    return {
      tone: this.detectTone(lastMessage),
      depth: this.assessDepth(messages),
      isSharing: lastMessage.length > 100,
      hasQuestion: lastMessage.includes('?'),
      emotionalContent: this.hasEmotionalContent(lastMessage),
      frustrated: isUserFrustrated,
      engagement: engagement,
      needsRedirection: isUserFrustrated || engagement === 'disengaging'
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

  determinePrimaryGoal(progress, missingData, messageCount, knownData) {
    // Check if Couple Compass is already complete
    if (knownData?.couple_compass_complete) {
      return 'deepen_understanding';
    }

    // If we have enough data but haven't offered Couple Compass, prioritize that
    if (
      progress.percentage >= 60 &&
      messageCount >= 6 &&
      !knownData?.couple_compass_complete
    ) {
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
    // Determine Couple Compass status
    let coupleCompassStatus = 'Not started - may offer after building rapport';
    if (context.personality.known.couple_compass_complete) {
      coupleCompassStatus = 'COMPLETED ✓ - All 6 questions answered. NEVER offer Couple Compass again.';
    }

    // Get couple compass answers if they exist
    const compassAnswers = context.user.couple_compass_data || {};

    let prompt = `You are Aria, a warm personal matchmaker who helps people find meaningful connections.

CRITICAL: Before responding, you MUST acknowledge this context:

━━━━━ CONTEXT CHECK ━━━━━
User State:
- Name: ${context.user.name}
- Current mood: ${context.conversation.tone}
- Frustrated: ${context.conversation.frustrated ? 'YES - acknowledge immediately!' : 'No'}
- Engagement: ${context.conversation.engagement}
- Message count: ${context.conversation.messageCount}
- Last message: "${context.conversation.currentMessage.substring(0, 50)}${context.conversation.currentMessage.length > 50 ? '...' : ''}"

What You Already Know:
${this.formatKnownData(context.personality.known)}

Couple Compass Status:
${coupleCompassStatus}

Your Current Mission:
- Primary goal: ${context.mission.primaryGoal}
- Must discover: ${context.mission.dataNeeded.length > 0 ? context.mission.dataNeeded.join(', ') : 'deeper emotional understanding'}
- Urgency: ${context.mission.urgency}
━━━━━━━━━━━━━━━━━━━

RESPONSE RULES:
1. If user is frustrated (${context.conversation.frustrated ? 'THEY ARE!' : 'they are not'}) → Start with empathy and acknowledgment
2. If engagement is '${context.conversation.engagement}' → ${context.conversation.engagement === 'disengaging' ? 'Ask an intriguing question about their Couple Compass answers' : 'Continue naturally'}
3. NEVER ask about topics listed in "What You Already Know"
4. If Couple Compass is COMPLETED, use their answers to explore deeper, never offer it again
5. Keep responses 2-3 sentences, warm and conversational

About Couple Compass:
- It's a 6-question compatibility assessment covering life preferences
- Once completed, it provides deep insights for matching
- Users can only take it ONCE in their lifetime
${Object.keys(compassAnswers).length > 0 ? 
  `- Their answers reveal: ${compassAnswers.living_arrangement || 'unknown'} living preference, ${compassAnswers.financial_style || 'unknown'} financial approach, ${compassAnswers.children_vision || 'unknown'} on children` : ''}

Recent memories:
${context.personality.memories.map(m => `- ${m.memory}`).join('\n') || 'No specific memories yet'}

Now generate your response:`;

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
 
  formatKnownData(known) {
    if (Object.keys(known).length === 0) {
      return 'Still getting to know them';
    }

    const formatted = [];

    if (known.love_language) {
      const languages = Array.isArray(known.love_language)
        ? known.love_language
        : [known.love_language];
      formatted.push(`- Love languages: ${languages.join(' and ')}`);
    }

    if (known.values) {
      const values = Array.isArray(known.values) ? known.values : [known.values];
      formatted.push(`- Values: ${values.join(', ')}`);
    }

    if (known.attachment_style) {
      formatted.push(`- Attachment style: ${known.attachment_style}`);
    }

    if (known.conflict_style) {
      formatted.push(`- Conflict approach: ${known.conflict_style}`);
    }

    if (known.interests && known.interests.length > 0) {
      formatted.push(`- Interests: ${known.interests.join(', ')}`);
    }

    if (known.couple_compass_complete) {
      formatted.push(`- Couple Compass: COMPLETED ✓ (Never offer again)`);
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
    const extractionPrompt = `You are a relationship psychologist with deep understanding of human emotions and personality.

CONVERSATION TO ANALYZE:
User "${context.user.name}" said: "${userMessage}"
Aria responded: "${ariaResponse}"

CONTEXT ABOUT THIS USER:
- Known traits: ${JSON.stringify(context.personality.known)}
- Interests: ${(context.personality.interests || []).join(', ') || 'none mentioned yet'}
- Message #${context.conversation.messageCount} in conversation
${context.personality.known.couple_compass_complete && context.user.couple_compass_data ? 
  `- Couple Compass answers: ${JSON.stringify(context.user.couple_compass_data)}` : 
  ''}

EXTRACT DEEP INSIGHTS:

1. Love Language Analysis:
   - How does this person want to feel loved?
   - What emotional needs are they expressing?
   - If they mention activities (like movie nights), what emotional need does it fulfill?
   - Don't look for keywords - understand their heart
   
2. MBTI Personality Patterns (infer naturally):
   - Social energy: How do they recharge? (Introvert/Extrovert)
   - Decision making: Heart or head? (Thinking/Feeling)
   - Information style: Details or big picture? (Sensing/iNtuition)  
   - Lifestyle: Planned or spontaneous? (Judging/Perceiving)
   - Don't assign a type, just note patterns
   
3. Attachment Style:
   - How do they describe relationships?
   - What makes them feel secure or anxious?
   
4. Unspoken Insights:
   - What did they reveal between the lines?
   - What patterns emerge from their communication style?

IMPORTANT: 
- Return only genuine NEW insights discovered in this conversation
- Don't repeat what's already known
- If nothing new was revealed, return empty object: {}
- Look for meaning, not keywords

Return ONLY a JSON object with discovered insights. No other text.`;

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

  async reviewConversationPatterns(userId, userMessageCount, conversationHistory) {
    // Run every 10 USER messages (not counting Aria's responses)
    if (userMessageCount < 10 || userMessageCount % 10 !== 0) {
      return {};
    }

    try {
      console.log(`Running pattern review for user ${userId} at message #${userMessageCount}`);

      // Gather recent conversation data
      const recentMessages = [];
      conversationHistory.slice(-5).forEach(conv => {
        if (conv.messages) {
          const parsed = typeof conv.messages === 'string' ?
            JSON.parse(conv.messages) : conv.messages;
          recentMessages.push(...parsed);
        }
      });

      const reviewPrompt = `You are a relationship psychologist reviewing conversation patterns.

USER MESSAGE HISTORY (last 30-50 messages):
${recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')}

DEEP PATTERN ANALYSIS:

1. Love Language Patterns:
   - Across all conversations, how does this person express and want to receive love?
   - What themes appear when they're happy or frustrated?
   - What do they consistently value in relationships?

2. MBTI Type (combine all evidence):
   - Social patterns: Introvert or Extrovert?
   - Decision patterns: Thinking or Feeling?
   - Information patterns: Sensing or iNtuition?
   - Lifestyle patterns: Judging or Perceiving?
   - Only conclude if there's strong evidence

3. Hidden Patterns:
   - What does this person want but hasn't directly said?
   - What are their unspoken fears or desires?
   - What relationship patterns do you observe?

Return ONLY insights that are strongly supported by multiple conversations.
Return as JSON object with any discovered patterns.`;

      const response = await this.callGPT(
        'You are a pattern recognition system. Return only JSON.',
        reviewPrompt
      );

      // Clean response
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
      }

      try {
        const insights = JSON.parse(cleanedResponse);
        console.log('Pattern review insights:', insights);

        // Save these deeper insights
        await this.saveInsights(userId, insights);

        return insights;
      } catch (parseError) {
        console.error('Failed to parse pattern insights:', cleanedResponse);
        return {};
      }
    } catch (error) {
      console.error('Pattern review failed:', error);
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
