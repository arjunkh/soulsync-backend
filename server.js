// Intelligent Aria Backend with PostgreSQL Memory System
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.use(express.json());

// Handle preflight requests
app.options('*', cors());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// REPLACE YOUR ENTIRE initializeDatabase function with this:
async function initializeDatabase() {
  try {
    // Enhanced users table with phone number
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(20) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        personality_data JSONB DEFAULT '{}',
        relationship_context JSONB DEFAULT '{}',
        total_conversations INTEGER DEFAULT 0,
        profile_completeness INTEGER DEFAULT 0
      )
    `);

    // Existing conversations table (same as before)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(user_id),
        conversation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        messages JSONB NOT NULL,
        insights_discovered JSONB DEFAULT '{}',
        session_summary TEXT
      )
    `);

    // NEW: Phone allowlist table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS phone_allowlist (
        id SERIAL PRIMARY KEY,
        phone_number VARCHAR(20) UNIQUE NOT NULL,
        added_by VARCHAR(50) DEFAULT 'admin',
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active',
        notes TEXT,
        first_access TIMESTAMP,
        last_access TIMESTAMP,
        total_sessions INTEGER DEFAULT 0
      )
    `);

    // Add your phone number (CHANGE THIS TO YOUR ACTUAL PHONE)
    await pool.query(`
      INSERT INTO phone_allowlist (phone_number, added_by, notes, status) 
      VALUES 
        ('+919873986469', 'system', 'App creator - primary admin', 'active')
      ON CONFLICT (phone_number) DO NOTHING
    `);

    console.log('✅ Database tables initialized successfully with allowlist system');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}
    // Conversations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(user_id),
        conversation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        messages JSONB NOT NULL,
        insights_discovered JSONB DEFAULT '{}',
        session_summary TEXT
      )
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// Initialize database on startup
initializeDatabase();

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
      topics: this.extractTopics(message),
      love_language_hints: this.detectLoveLanguageHints(message),
      attachment_hints: this.detectAttachmentHints(message),
      family_values_hints: this.detectFamilyValueHints(message)
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
    const topics = [];
    const msg = message.toLowerCase();
    
    if (msg.includes('morning') || msg.includes('breakfast')) topics.push('morning_routine');
    if (msg.includes('weekend') || msg.includes('sunday')) topics.push('weekends');
    if (msg.includes('family') || msg.includes('parents')) topics.push('family');
    if (msg.includes('friends') || msg.includes('social')) topics.push('social_life');
    
    return topics;
  }

  // New: Love language detection
  detectLoveLanguageHints(message) {
    const msg = message.toLowerCase();
    const hints = [];
    
    if (msg.includes('time') || msg.includes('together') || msg.includes('presence')) {
      hints.push('quality_time');
    }
    if (msg.includes('touch') || msg.includes('hug') || msg.includes('hold')) {
      hints.push('physical_touch');
    }
    if (msg.includes('help') || msg.includes('do') || msg.includes('support')) {
      hints.push('acts_of_service');
    }
    if (msg.includes('words') || msg.includes('tell') || msg.includes('appreciate')) {
      hints.push('words_of_affirmation');
    }
    if (msg.includes('gift') || msg.includes('surprise') || msg.includes('thoughtful')) {
      hints.push('gifts');
    }
    
    return hints;
  }

  // New: Attachment style hints
  detectAttachmentHints(message) {
    const msg = message.toLowerCase();
    const hints = [];
    
    if (msg.includes('space') || msg.includes('independent') || msg.includes('alone time')) {
      hints.push('avoidant_tendency');
    }
    if (msg.includes('close') || msg.includes('together') || msg.includes('connection')) {
      hints.push('secure_tendency');
    }
    if (msg.includes('worry') || msg.includes('anxious') || msg.includes('need reassurance')) {
      hints.push('anxious_tendency');
    }
    
    return hints;
  }

  // New: Family values detection
  detectFamilyValueHints(message) {
    const msg = message.toLowerCase();
    const hints = [];
    
    if (msg.includes('kids') || msg.includes('children') || msg.includes('family')) {
      hints.push('family_oriented');
    }
    if (msg.includes('career') || msg.includes('goals') || msg.includes('ambitious')) {
      hints.push('career_focused');
    }
    if (msg.includes('parents') || msg.includes('close to family')) {
      hints.push('family_connected');
    }
    
    return hints;
  }

  // Generate adaptive system prompt based on user analysis and history
  generateSystemPrompt(userAnalysis, userProfile, conversationHistory) {
    const { mood, energy, interests, communication_style, emotional_needs } = userAnalysis;
    
    let prompt = `You are Aria, an emotionally intelligent AI companion for relationship coaching and matchmaking.

CURRENT USER STATE:
- Mood: ${mood}
- Energy Level: ${energy}
- Communication Style: ${communication_style}
- Current Interests: ${interests.join(', ') || 'discovering'}
- Emotional Needs: ${emotional_needs.join(', ') || 'connection'}

USER PROFILE (from previous conversations):
- Known Interests: ${userProfile.interests ? userProfile.interests.join(', ') : 'still learning'}
- Communication Patterns: ${userProfile.communication_patterns ? JSON.stringify(userProfile.communication_patterns) : 'observing'}
- Emotional Patterns: ${userProfile.emotional_patterns ? JSON.stringify(userProfile.emotional_patterns) : 'learning'}
- Relationship Context: ${userProfile.relationship_context ? userProfile.relationship_context.current_depth || 'building' : 'new'}

CONVERSATION HISTORY CONTEXT:
${conversationHistory.length > 0 ? 'Previous conversations: ' + conversationHistory.length + ' sessions' : 'First conversation'}
${conversationHistory.length > 0 ? 'Last conversation summary: ' + (conversationHistory[conversationHistory.length - 1]?.session_summary || 'Getting to know each other') : ''}

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

    // Reference previous conversations if they exist
    if (conversationHistory.length > 0) {
      prompt += `\n- Reference previous conversations naturally
- Build on topics you've discussed before
- Show that you remember and care about their updates`;
    }

    prompt += `

CONVERSATION GOALS:
- Have a genuine, human-like conversation
- Naturally discover insights about their personality for matchmaking
- Build emotional connection and trust
- Learn about: love language, emotional processing, relationship vision, family values, lifestyle preferences

KEY INSIGHTS TO DISCOVER NATURALLY (don't force, let conversation flow):
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
// ADD THESE FUNCTIONS RIGHT BEFORE your existing "async function getOrCreateUser(userId)" line:

// Phone number validation helper
function normalizePhoneNumber(phone) {
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return '+' + cleaned;
  }
  
  if (cleaned.length === 10) {
    return '+91' + cleaned;
  }
  
  if (cleaned.length > 10) {
    return '+' + cleaned;
  }
  
  return cleaned;
}

// Check if phone number is allowed
async function isPhoneAllowed(phoneNumber) {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const result = await pool.query(
      'SELECT * FROM phone_allowlist WHERE phone_number = $1 AND status = $2',
      [normalizedPhone, 'active']
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking phone allowlist:', error);
    return false;
  }
}

// Track when someone uses the app
async function trackAllowlistAccess(phoneNumber) {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    await pool.query(`
      UPDATE phone_allowlist 
      SET 
        last_access = CURRENT_TIMESTAMP,
        total_sessions = total_sessions + 1,
        first_access = COALESCE(first_access, CURRENT_TIMESTAMP)
      WHERE phone_number = $1
    `, [normalizedPhone]);
  } catch (error) {
    console.error('Error tracking allowlist access:', error);
  }
}

// Create user with phone number
async function getOrCreateUserWithPhone(phoneNumber) {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    if (!await isPhoneAllowed(normalizedPhone)) {
      throw new Error('Phone number not in allowlist');
    }
    
    await trackAllowlistAccess(normalizedPhone);
    
    const userId = 'user_' + normalizedPhone.replace(/\D/g, '');
    
    let result = await pool.query('SELECT * FROM users WHERE phone_number = $1', [normalizedPhone]);
    
    if (result.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO users (user_id, phone_number, personality_data, relationship_context) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [userId, normalizedPhone, {}, { current_depth: 'new', topics_covered: [], comfort_level: 'getting_acquainted' }]
      );
    } else {
      await pool.query('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE phone_number = $1', [normalizedPhone]);
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error getting/creating user with phone:', error);
    throw error;
  }
}
// Database helper functions
async function getOrCreateUser(userId) {
  try {
    // Try to get existing user
    let result = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    
    if (result.rows.length === 0) {
      // Create new user
      result = await pool.query(
        'INSERT INTO users (user_id, personality_data, relationship_context) VALUES ($1, $2, $3) RETURNING *',
        [userId, {}, { current_depth: 'new', topics_covered: [], comfort_level: 'getting_acquainted' }]
      );
    } else {
      // Update last_seen for existing user
      await pool.query('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE user_id = $1', [userId]);
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error getting/creating user:', error);
    throw error;
  }
}

async function getUserConversationHistory(userId, limit = 5) {
  try {
    const result = await pool.query(
      'SELECT * FROM conversations WHERE user_id = $1 ORDER BY conversation_date DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows.reverse(); // Return in chronological order
  } catch (error) {
    console.error('Error getting conversation history:', error);
    return [];
  }
}

async function saveConversation(userId, messages, insights, summary) {
  try {
    await pool.query(
      'INSERT INTO conversations (user_id, messages, insights_discovered, session_summary) VALUES ($1, $2, $3, $4)',
      [userId, JSON.stringify(messages), insights, summary]
    );
  } catch (error) {
    console.error('Error saving conversation:', error);
  }
}

async function updateUserProfile(userId, newInsights) {
  try {
    const user = await pool.query('SELECT personality_data FROM users WHERE user_id = $1', [userId]);
    const currentData = user.rows[0]?.personality_data || {};
    
    // Merge new insights with existing data
    const updatedData = {
      ...currentData,
      interests: [...new Set([...(currentData.interests || []), ...(newInsights.interests || [])])],
      communication_patterns: { ...currentData.communication_patterns, ...newInsights.communication_patterns },
      emotional_patterns: { ...currentData.emotional_patterns, ...newInsights.emotional_patterns },
      love_language_hints: [...new Set([...(currentData.love_language_hints || []), ...(newInsights.love_language_hints || [])])],
      attachment_hints: [...new Set([...(currentData.attachment_hints || []), ...(newInsights.attachment_hints || [])])],
      family_values_hints: [...new Set([...(currentData.family_values_hints || []), ...(newInsights.family_values_hints || [])])]
    };
    
    await pool.query(
      'UPDATE users SET personality_data = $1 WHERE user_id = $2',
      [JSON.stringify(updatedData), userId]
    );
    
    return updatedData;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}
// ADD THESE ENDPOINTS RIGHT BEFORE your existing "app.post('/api/chat'..." line:

// Phone number verification endpoint
app.post('/api/verify-phone', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }
    
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const isAllowed = await isPhoneAllowed(normalizedPhone);
    
    if (isAllowed) {
      const user = await getOrCreateUserWithPhone(normalizedPhone);
      
      res.json({
        success: true,
        message: 'Welcome to SoulSync! 🎉',
        user: {
          id: user.user_id,
          phone: user.phone_number,
          isNewUser: user.total_conversations === 0,
          profileCompleteness: user.profile_completeness || 0,
          lastSeen: user.last_seen
        }
      });
    } else {
      res.status(403).json({
        success: false,
        message: 'Thanks for your interest! SoulSync is currently in private beta.',
        waitlist: true
      });
    }
  } catch (error) {
    console.error('Phone verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Verification failed. Please try again.' 
    });
  }
});

// Admin: Add phone number
app.post('/api/admin/add-phone', async (req, res) => {
  try {
    const { phoneNumber, notes = '', adminKey } = req.body;
    
    if (adminKey !== 'soulsync_admin_2025') {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    const countResult = await pool.query('SELECT COUNT(*) FROM phone_allowlist WHERE status = $1', ['active']);
    const currentCount = parseInt(countResult.rows[0].count);
    
    if (currentCount >= 35) {
      return res.status(400).json({ 
        message: 'Allowlist is full (35/35). Remove a number first.' 
      });
    }
    
    await pool.query(
      'INSERT INTO phone_allowlist (phone_number, notes, added_by) VALUES ($1, $2, $3) ON CONFLICT (phone_number) DO UPDATE SET status = $4, notes = $2',
      [normalizedPhone, notes, 'admin', 'active']
    );
    
    res.json({ 
      success: true, 
      message: `Phone ${normalizedPhone} added to allowlist`,
      currentCount: currentCount + 1,
      remaining: 34 - currentCount
    });
    
  } catch (error) {
    console.error('Add phone error:', error);
    res.status(500).json({ message: 'Failed to add phone number' });
  }
});

// Admin: Remove phone number
app.post('/api/admin/remove-phone', async (req, res) => {
  try {
    const { phoneNumber, adminKey } = req.body;
    
    if (adminKey !== 'soulsync_admin_2025') {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    await pool.query(
      'UPDATE phone_allowlist SET status = $1 WHERE phone_number = $2',
      ['removed', normalizedPhone]
    );
    
    const countResult = await pool.query('SELECT COUNT(*) FROM phone_allowlist WHERE status = $1', ['active']);
    const currentCount = parseInt(countResult.rows[0].count);
    
    res.json({ 
      success: true, 
      message: `Phone ${normalizedPhone} removed from allowlist`,
      currentCount: currentCount,
      available: 35 - currentCount
    });
    
  } catch (error) {
    console.error('Remove phone error:', error);
    res.status(500).json({ message: 'Failed to remove phone number' });
  }
});

// Admin: View allowlist
app.get('/api/admin/allowlist-status/:adminKey', async (req, res) => {
  try {
    const { adminKey } = req.params;
    
    if (adminKey !== 'soulsync_admin_2025') {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const allowlistResult = await pool.query(`
      SELECT 
        al.*,
        u.total_conversations,
        u.last_seen as user_last_seen,
        u.profile_completeness
      FROM phone_allowlist al
      LEFT JOIN users u ON al.phone_number = u.phone_number
      WHERE al.status = 'active'
      ORDER BY al.added_at DESC
    `);
    
    const totalCount = allowlistResult.rows.length;
    const available = 35 - totalCount;
    
    res.json({
      totalAllowed: totalCount,
      maxCapacity: 35,
      available: available,
      allowlist: allowlistResult.rows.map(row => ({
        phone: row.phone_number,
        addedAt: row.added_at,
        notes: row.notes,
        firstAccess: row.first_access,
        lastAccess: row.last_access,
        totalSessions: row.total_sessions || 0,
        userConversations: row.total_conversations || 0,
        profileCompleteness: row.profile_completeness || 0,
        status: row.user_last_seen ? 'Active User' : 'Not Started'
      }))
    });
    
  } catch (error) {
    console.error('Allowlist status error:', error);
    res.status(500).json({ message: 'Failed to get allowlist status' });
  }
});
// Main chat endpoint with memory integration
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, apiKey, userId = 'default' } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }

    // Get or create user profile
    const user = await getOrCreateUser(userId);
    const conversationHistory = await getUserConversationHistory(userId);
    
    const aria = new AriaPersonality();
    
    // Get the latest user message
    const latestUserMessage = messages[messages.length - 1];
    if (latestUserMessage && latestUserMessage.role === 'user') {
      // Analyze the user's message
      const analysis = aria.analyzeMessage(latestUserMessage.content, conversationHistory);
      
      // Update user profile with new insights
      const updatedProfile = await updateUserProfile(userId, {
        interests: analysis.interests,
        communication_patterns: { style: analysis.communication_style },
        emotional_patterns: { 
          latest_mood: analysis.mood, 
          latest_energy: analysis.energy,
          emotional_needs: analysis.emotional_needs
        },
        love_language_hints: analysis.love_language_hints,
        attachment_hints: analysis.attachment_hints,
        family_values_hints: analysis.family_values_hints
      });
      
      // Generate adaptive system prompt with memory context
      const adaptivePrompt = aria.generateSystemPrompt(analysis, updatedProfile, conversationHistory);
      
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
      
      // Save this conversation exchange
      await saveConversation(
        userId, 
        [latestUserMessage, { role: 'assistant', content: data.choices[0].message.content }],
        analysis,
        `Discussed: ${analysis.topics.join(', ') || 'general conversation'}`
      );

      // Return response with user insights
      res.json({
        ...data,
        userInsights: {
          detectedMood: analysis.mood,
          detectedEnergy: analysis.energy,
          currentInterests: updatedProfile.interests || [],
          communicationStyle: analysis.communication_style,
          emotionalNeeds: analysis.emotional_needs,
          conversationCount: conversationHistory.length + 1,
          isReturningUser: conversationHistory.length > 0
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
app.get('/api/user-insights/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    const conversations = await getUserConversationHistory(userId, 10);
    
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = user.rows[0];
    
    res.json({
      userId: userData.user_id,
      createdAt: userData.created_at,
      lastSeen: userData.last_seen,
      personalityData: userData.personality_data,
      relationshipContext: userData.relationship_context,
      conversationCount: conversations.length,
      recentTopics: conversations.slice(-3).map(conv => conv.session_summary),
      profileCompleteness: calculateProfileCompleteness(userData.personality_data)
    });
  } catch (error) {
    console.error('Error getting user insights:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function calculateProfileCompleteness(personalityData) {
  const requiredFields = ['interests', 'love_language_hints', 'attachment_hints', 'family_values_hints'];
  const completedFields = requiredFields.filter(field => 
    personalityData[field] && personalityData[field].length > 0
  );
  return Math.round((completedFields.length / requiredFields.length) * 100);
}
// Database connection test endpoint - ADD THIS BEFORE THE /api/health ENDPOINT
app.get('/api/test-db', async (req, res) => {
  try {
    // Test basic connection
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    client.release();

    // Test table existence
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

    // Test user creation and retrieval
    const testUserId = 'test-user-' + Date.now();
    await getOrCreateUser(testUserId);
    const userCheck = await pool.query('SELECT * FROM users WHERE user_id = $1', [testUserId]);

    // Get total user count
    const userCountResult = await pool.query('SELECT COUNT(*) FROM users');

    res.json({
      status: 'Database connection successful! 🎉',
      database_info: {
        connected: true,
        current_time: result.rows[0].current_time,
        tables_created: tablesResult.rows.map(row => row.table_name),
        test_user_created: userCheck.rows.length > 0,
        total_users: userCountResult.rows[0].count
      },
      features: [
        'User profiles with personality data',
        'Conversation history tracking',
        'Cross-session memory',
        'Progressive relationship building',
        'Mood and interest persistence'
      ]
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({ 
      status: 'Database connection failed',
      error: error.message,
      suggestion: 'Make sure PostgreSQL is added to your Railway project and DATABASE_URL is set'
    });
  }
});
// Enhanced health check with database status - REPLACE YOUR EXISTING /api/health
app.get('/api/health', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'Intelligent Aria backend with PostgreSQL Memory running!',
      database_connected: true,
      database_time: dbTest.rows[0].now,
      features: [
        'PostgreSQL Memory System',
        'Cross-session Continuity',
        'Adaptive personality system',
        'Real-time mood detection',
        'Interest tracking',
        'Love language detection',
        'Attachment style hints',
        'Family values analysis',
        'Progressive relationship building'
      ]
    });
  } catch (error) {
    res.json({ 
      status: 'Backend running, database connection issue',
      database_connected: false,
      database_error: error.message,
      features: [
        'In-memory storage (fallback)',
        'Basic conversation flow',
        'Mood detection',
        'Interest tracking'
      ]
    });
  }
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🧠 Intelligent Aria Backend with Memory running on port ${PORT}`);
  console.log('Features: PostgreSQL Memory, Cross-session Continuity, Advanced Profiling');
});
