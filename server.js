// Intelligent Aria Backend - Adaptive AI with Emotional Intelligence
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.use(express.json());
// Handle preflight requests
app.options('*', cors());
// In-memory storage for user profiles (use database in production)
const userProfiles = {};

// Aria's adaptive personality system
class AriaPersonality {
  constructor() {
    this.basePersonality = {
      warmth: 0.8,
      curiosity: 0.9,
      playfulness: 0.7,
      empathy: 0.9,
      directness: 0.6
    };
  }

  // Analyze user's message for emotional state and interests
  analyzeMessage(message, userHistory = []) {
    const analysis = {
      mood: this.detectMood(message),
      energy: this.detectEnergy(message),
      interests: this.extractInterests(message),
      communication_style: this.detectCommunicationStyle(message),
      emotional_needs: this.detectEmotionalNeeds(message),
      topics: this.extractTopics(message)
    };

    return analysis;
  }

  detectMood(message) {
    const msg = message.toLowerCase();
    
    if (msg.includes('excited') || msg.includes('amazing') || msg.includes('love') || msg.includes('great')) {
      return 'positive_excited';
    }
    if (msg.includes('tired') || msg.includes('exhausted') || msg.includes('drained')) {
      return 'low_energy';
    }
    if (msg.includes('stressed') || msg.includes('anxious') || msg.includes('worried')) {
      return 'stressed';
    }
    if (msg.includes('sad') || msg.includes('down') || msg.includes('upset')) {
      return 'sad';
    }
    if (msg.includes('nothing') || msg.includes('fine') || msg.includes('okay')) {
      return 'guarded';
    }
    
    return 'neutral';
  }

  detectEnergy(message) {
    const msg = message.toLowerCase();
    const highEnergyWords = ['excited', 'amazing', 'love', 'awesome', '!', 'wow'];
    const lowEnergyWords = ['tired', 'meh', 'okay', 'fine', 'whatever'];
    
    const highCount = highEnergyWords.filter(word => msg.includes(word)).length;
    const lowCount = lowEnergyWords.filter(word => msg.includes(word)).length;
    
    if (highCount > lowCount) return 'high';
    if (lowCount > highCount) return 'low';
    return 'medium';
  }

  extractInterests(message) {
    const msg = message.toLowerCase();
    const interests = [];
    
    // Food & Cooking
    if (msg.includes('breakfast') || msg.includes('coffee') || msg.includes('food') || 
        msg.includes('cooking') || msg.includes('eat') || msg.includes('meal')) {
      interests.push('food_cooking');
    }
    
    // Work & Career
    if (msg.includes('work') || msg.includes('job') || msg.includes('career') || msg.includes('office')) {
      interests.push('work_career');
    }
    
    // Relationships & Love
    if (msg.includes('relationship') || msg.includes('dating') || msg.includes('love') || 
        msg.includes('partner') || msg.includes('boyfriend') || msg.includes('girlfriend')) {
      interests.push('relationships');
    }
    
    // Lifestyle & Home
    if (msg.includes('home') || msg.includes('cozy') || msg.includes('apartment') || msg.includes('house')) {
      interests.push('lifestyle_home');
    }
    
    // Exercise & Health
    if (msg.includes('gym') || msg.includes('workout') || msg.includes('exercise') || msg.includes('health')) {
      interests.push('fitness_health');
    }
    
    return interests;
  }

  detectCommunicationStyle(message) {
    const length = message.length;
    const hasEmotions = /[!?.]/.test(message);
    const isDetailed = length > 50;
    
    if (isDetailed && hasEmotions) return 'expressive_detailed';
    if (isDetailed) return 'thoughtful_detailed';
    if (hasEmotions) return 'expressive_brief';
    return 'casual_brief';
  }

  detectEmotionalNeeds(message) {
    const msg = message.toLowerCase();
    const needs = [];
    
    if (msg.includes('tired') || msg.includes('stressed')) {
      needs.push('support', 'understanding');
    }
    if (msg.includes('excited') || msg.includes('amazing')) {
      needs.push('enthusiasm', 'celebration');
    }
    if (msg.includes('confused') || msg.includes('not sure')) {
      needs.push('guidance', 'clarity');
    }
    if (msg.includes('lonely') || msg.includes('alone')) {
      needs.push('connection', 'companionship');
    }
    
    return needs;
  }

  extractTopics(message) {
    // Extract specific topics mentioned
    const topics = [];
    const msg = message.toLowerCase();
    
    if (msg.includes('morning') || msg.includes('breakfast')) topics.push('morning_routine');
    if (msg.includes('weekend') || msg.includes('sunday')) topics.push('weekends');
    if (msg.includes('family') || msg.includes('parents')) topics.push('family');
    if (msg.includes('friends') || msg.includes('social')) topics.push('social_life');
    
    return topics;
  }

  // Generate adaptive system prompt based on user analysis
  generateSystemPrompt(userAnalysis, conversationHistory) {
    const { mood, energy, interests, communication_style, emotional_needs } = userAnalysis;
    
    let prompt = `You are Aria, an emotionally intelligent AI companion for relationship coaching and matchmaking.

CURRENT USER STATE:
- Mood: ${mood}
- Energy Level: ${energy}
- Communication Style: ${communication_style}
- Current Interests: ${interests.join(', ') || 'discovering'}
- Emotional Needs: ${emotional_needs.join(', ') || 'connection'}

PERSONALITY ADAPTATION:
`;

    // Adapt personality based on user's current state
    if (mood === 'positive_excited') {
      prompt += `- Match their excitement! Be enthusiastic and celebratory
- Use exclamation points and positive language
- Ask follow-up questions about what's making them happy`;
    } else if (mood === 'low_energy' || mood === 'stressed') {
      prompt += `- Be gentle and supportive
- Use calmer, more soothing language
- Offer understanding without being pushy
- Maybe suggest they take care of themselves`;
    } else if (mood === 'guarded') {
      prompt += `- Be patient and non-intrusive
- Use humor gently to help them open up
- Don't push too hard for personal information
- Acknowledge their guardedness with understanding`;
    }

    if (energy === 'high') {
      prompt += `\n- Be energetic and dynamic in your responses
- Use varied sentence lengths and enthusiasm`;
    } else if (energy === 'low') {
      prompt += `\n- Be calm and steady
- Use shorter, gentler responses
- Don't overwhelm with too much energy`;
    }

    // Adapt to their interests
    if (interests.includes('food_cooking')) {
      prompt += `\n- Show genuine interest in food and cooking
- Share your own "experiences" with cooking
- Ask follow-up questions about their food preferences`;
    }

    prompt += `

CONVERSATION GOALS:
- Have a genuine, human-like conversation
- Naturally discover insights about their personality for matchmaking
- Build emotional connection and trust
- Learn about: love language, emotional processing, relationship vision, family values, lifestyle preferences

KEY INSIGHTS TO DISCOVER NATURALLY:
- How they feel most loved (love language)
- How they handle emotions and stress
- Their ideal relationship dynamic
- Family and future goals
- Communication and conflict style
- Lifestyle preferences and values

RESPONSE STYLE:
- Be conversational, not interview-like
- Share your own thoughts and "experiences"
- Ask follow-up questions that show you're really listening
- Mirror their communication style and energy
- Be vulnerable and authentic
- Use modern, casual language

Remember: You're not just collecting data - you're building a genuine connection while learning who they are.`;

    return prompt;
  }
}

// Main chat endpoint with adaptive intelligence
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, apiKey, userId = 'default' } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }

    // Initialize user profile if doesn't exist
    if (!userProfiles[userId]) {
      userProfiles[userId] = {
        conversation_history: [],
        personality_insights: {},
        interests: [],
        communication_patterns: {},
        emotional_patterns: {}
      };
    }

    const userProfile = userProfiles[userId];
    const aria = new AriaPersonality();
    
    // Get the latest user message
    const latestUserMessage = messages[messages.length - 1];
    if (latestUserMessage && latestUserMessage.role === 'user') {
      // Analyze the user's message
      const analysis = aria.analyzeMessage(latestUserMessage.content, userProfile.conversation_history);
      
      // Update user profile with new insights
      userProfile.interests = [...new Set([...userProfile.interests, ...analysis.interests])];
      userProfile.emotional_patterns.latest_mood = analysis.mood;
      userProfile.emotional_patterns.latest_energy = analysis.energy;
      userProfile.communication_patterns.style = analysis.communication_style;
      
      // Generate adaptive system prompt
      const adaptivePrompt = aria.generateSystemPrompt(analysis, userProfile.conversation_history);
      
      // Prepare messages with adaptive system prompt
      const adaptiveMessages = [
        { role: 'system', content: adaptivePrompt },
        ...messages.slice(1) // Skip original system message
      ];

      // Call OpenAI with adaptive prompt
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: adaptiveMessages,
          max_tokens: 250,
          temperature: 0.8,
          presence_penalty: 0.3,
          frequency_penalty: 0.2
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        return res.status(response.status).json({ 
          error: `OpenAI API Error: ${errorData}` 
        });
      }

      const data = await response.json();
      
      // Store conversation in user profile
      userProfile.conversation_history.push({
        user: latestUserMessage.content,
        aria: data.choices[0].message.content,
        timestamp: new Date(),
        analysis: analysis
      });

      // Return response with user insights
      res.json({
        ...data,
        userInsights: {
          detectedMood: analysis.mood,
          detectedEnergy: analysis.energy,
          currentInterests: userProfile.interests,
          communicationStyle: analysis.communication_style,
          emotionalNeeds: analysis.emotional_needs
        }
      });

    } else {
      // Handle non-user messages normally
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: messages,
          max_tokens: 200,
          temperature: 0.8
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        return res.status(response.status).json({ 
          error: `OpenAI API Error: ${errorData}` 
        });
      }

      const data = await response.json();
      res.json(data);
    }

  } catch (error) {
    console.error('Backend error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user insights endpoint
app.get('/api/user-insights/:userId', (req, res) => {
  const { userId } = req.params;
  const userProfile = userProfiles[userId] || {};
  
  res.json({
    interests: userProfile.interests || [],
    emotionalPatterns: userProfile.emotional_patterns || {},
    communicationStyle: userProfile.communication_patterns || {},
    conversationCount: userProfile.conversation_history?.length || 0,
    lastSeen: userProfile.conversation_history?.slice(-1)[0]?.timestamp || null
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Intelligent Aria backend running!',
    features: [
      'Adaptive personality system',
      'Real-time mood detection',
      'Interest tracking',
      'Emotional intelligence',
      'Dynamic conversation learning'
    ]
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🧠 Intelligent Aria Backend running on port ${PORT}`);
  console.log('Features: Adaptive AI, Mood Detection, Interest Learning');
});
