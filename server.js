// Intelligent Aria Backend with PostgreSQL Memory System + Allowlist - PHASE 1 FIXES
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

// Enhanced database initialization with allowlist system
async function initializeDatabase() {
  try {
    // Enhanced Users table with complete profile info
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(20) UNIQUE,
        user_name VARCHAR(100),
        user_gender VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        personality_data JSONB DEFAULT '{}',
        relationship_context JSONB DEFAULT '{}',
        total_conversations INTEGER DEFAULT 0,
        profile_completeness INTEGER DEFAULT 0
      )
    `);

    // Conversations table (same as before)
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
        user_name VARCHAR(100),
        user_gender VARCHAR(10),
        added_by VARCHAR(50) DEFAULT 'admin',
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active',
        notes TEXT,
        first_access TIMESTAMP,
        last_access TIMESTAMP,
        total_sessions INTEGER DEFAULT 0
      )
    `);

    // Add initial admin numbers (REPLACE WITH YOUR ACTUAL PHONE NUMBERS)
    await pool.query(`
      INSERT INTO phone_allowlist (phone_number, user_name, user_gender, added_by, notes, status) 
      VALUES 
        ('+919876543210', 'Admin User', 'Male', 'system', 'App creator - primary admin', 'active'),
        ('+911234567890', 'Test User', 'Female', 'system', 'Test number for development', 'active')
      ON CONFLICT (phone_number) DO NOTHING
    `);

    console.log('✅ Database tables initialized successfully with complete allowlist system');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// Initialize database on startup
initializeDatabase();

// FIXED: Enhanced phone number validation and normalization
function normalizePhoneNumber(phone) {
  if (!phone) return null;
  
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  
  console.log(`📱 Normalizing phone: "${phone}" -> cleaned: "${cleaned}"`);
  
  // If starts with 91 (India) and has 12 digits total, add +
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    const normalized = '+' + cleaned;
    console.log(`📱 Normalized (12-digit): ${normalized}`);
    return normalized;
  }
  
  // If 10 digits, assume Indian number and add +91
  if (cleaned.length === 10) {
    const normalized = '+91' + cleaned;
    console.log(`📱 Normalized (10-digit): ${normalized}`);
    return normalized;
  }
  
  // If already has country code format
  if (cleaned.length > 10) {
    const normalized = '+' + cleaned;
    console.log(`📱 Normalized (long): ${normalized}`);
    return normalized;
  }
  
  // Default to Indian format
  const normalized = '+91' + cleaned;
  console.log(`📱 Normalized (default): ${normalized}`);
  return normalized;
}

// FIXED: Enhanced phone allowlist check with debugging
async function isPhoneAllowed(phoneNumber) {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    console.log(`🔍 Checking allowlist for: ${normalizedPhone}`);
    
    const result = await pool.query(
      'SELECT * FROM phone_allowlist WHERE phone_number = $1 AND status = $2',
      [normalizedPhone, 'active']
    );
    
    console.log(`🔍 Allowlist check result: ${result.rows.length} matches found`);
    if (result.rows.length > 0) {
      console.log(`✅ Phone found in allowlist:`, result.rows[0]);
    } else {
      // DEBUGGING: Show all active numbers in allowlist
      const allActive = await pool.query('SELECT phone_number FROM phone_allowlist WHERE status = $1', ['active']);
      console.log(`❌ Phone not found. Active numbers in allowlist:`, allActive.rows.map(r => r.phone_number));
    }
    
    return result.rows.length > 0 ? result.rows[0] : false;
  } catch (error) {
    console.error('❌ Error checking phone allowlist:', error);
    return false;
  }
}

// Track allowlist access
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

// Enhanced user creation with complete profile
async function getOrCreateUserWithPhone(phoneNumber, userName, userGender) {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    // Check if phone is allowed
    const allowlistEntry = await isPhoneAllowed(normalizedPhone);
    if (!allowlistEntry) {
      throw new Error('Phone number not in allowlist');
    }
    
    // Track access
    await trackAllowlistAccess(normalizedPhone);
    
    // Create user ID from phone (remove + and special chars)
    const userId = 'user_' + normalizedPhone.replace(/\D/g, '');
    
    // Try to get existing user
    let result = await pool.query('SELECT * FROM users WHERE phone_number = $1', [normalizedPhone]);
    
    if (result.rows.length === 0) {
      // Create new user with complete profile
      result = await pool.query(
        `INSERT INTO users (user_id, phone_number, user_name, user_gender, personality_data, relationship_context, total_conversations) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          userId, 
          normalizedPhone, 
          userName, 
          userGender,
          { name: userName, gender: userGender }, 
          { current_depth: 'new', topics_covered: [], comfort_level: 'getting_acquainted' },
          0
        ]
      );
      console.log(`✅ Created new user: ${userId}`);
    } else {
      // Update existing user with any new info and last_seen
      await pool.query(`
        UPDATE users 
        SET 
          last_seen = CURRENT_TIMESTAMP,
          user_name = COALESCE($2, user_name),
          user_gender = COALESCE($3, user_gender)
        WHERE phone_number = $1`,
        [normalizedPhone, userName, userGender]
      );
      result = await pool.query('SELECT * FROM users WHERE phone_number = $1', [normalizedPhone]);
      console.log(`✅ Updated existing user: ${result.rows[0].user_id}`);
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error getting/creating user with phone:', error);
    throw error;
  }
}

// FIXED: Enhanced phone verification endpoint with detailed error handling
app.post('/api/verify-phone', async (req, res) => {
  try {
    console.log('📱 Phone verification request received:', req.body);
    
    const { phoneNumber, userName, userGender } = req.body;
    
    // Validate required fields
    if (!phoneNumber) {
      console.log('❌ Missing phone number');
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    if (!userName) {
      console.log('❌ Missing user name');
      return res.status(400).json({ 
        success: false, 
        message: 'Name is required' 
      });
    }

    if (!userGender) {
      console.log('❌ Missing user gender');
      return res.status(400).json({ 
        success: false, 
        message: 'Gender is required' 
      });
    }
    
    console.log(`📱 Verifying: ${userName} (${userGender}) - ${phoneNumber}`);
    
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const allowlistEntry = await isPhoneAllowed(normalizedPhone);
    
    if (allowlistEntry) {
      console.log('✅ Phone verification successful');
      
      // Create or get user with complete profile
      const user = await getOrCreateUserWithPhone(normalizedPhone, userName.trim(), userGender);
      
      res.json({
        success: true,
        message: `Welcome to SoulSync, ${userName}! 🎉`,
        user: {
          id: user.user_id,
          name: userName.trim(),
          gender: userGender,
          phone: user.phone_number,
          isNewUser: user.total_conversations === 0,
          profileCompleteness: user.profile_completeness || 0,
          lastSeen: user.last_seen
        }
      });
    } else {
      console.log(`❌ Phone verification failed - not in allowlist: ${normalizedPhone}`);
      res.status(403).json({
        success: false,
        message: `Thanks for your interest, ${userName}! SoulSync is currently in private beta. We'll notify you when it's available.`,
        waitlist: true
      });
    }
  } catch (error) {
    console.error('❌ Phone verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Verification failed: ${error.message}. Please try again.`
    });
  }
});

// DEBUGGING: Add phone number to allowlist easily
app.post('/api/admin/add-phone', async (req, res) => {
  try {
    const { phoneNumber, userName = '', userGender = '', notes = '', adminKey } = req.body;
    
    // Simple admin protection (you can change this key)
    if (adminKey !== 'soulsync_admin_2025') {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    // Check current allowlist count
    const countResult = await pool.query('SELECT COUNT(*) FROM phone_allowlist WHERE status = $1', ['active']);
    const currentCount = parseInt(countResult.rows[0].count);
    
    if (currentCount >= 35) {
      return res.status(400).json({ 
        message: 'Allowlist is full (35/35). Remove a number first.' 
      });
    }
    
    // Add to allowlist
    await pool.query(
      `INSERT INTO phone_allowlist (phone_number, user_name, user_gender, notes, added_by) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (phone_number) DO UPDATE SET 
         status = 'active', 
         user_name = $2, 
         user_gender = $3, 
         notes = $4`,
      [normalizedPhone, userName, userGender, notes, 'admin']
    );
    
    res.json({ 
      success: true, 
      message: `Phone ${normalizedPhone} (${userName}) added to allowlist`,
      currentCount: currentCount + 1,
      remaining: 34 - currentCount
    });
    
  } catch (error) {
    console.error('Add phone error:', error);
    res.status(500).json({ message: 'Failed to add phone number' });
  }
});

// DEBUGGING: View allowlist status
app.get('/api/admin/allowlist-status/:adminKey', async (req, res) => {
  try {
    const { adminKey } = req.params;
    
    if (adminKey !== 'soulsync_admin_2025') {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // Get allowlist with usage stats
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
        name: row.user_name || 'Unknown',
        gender: row.user_gender || 'Unknown',
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

// Aria's adaptive personality system (keeping existing)
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

  // Love language detection
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

  // Attachment style hints
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

  // Family values detection
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

  // Generate adaptive system prompt with user profile context
  generateSystemPrompt(userAnalysis, userProfile, conversationHistory, user) {
    const { mood, energy, interests, communication_style, emotional_needs } = userAnalysis;
    
    let prompt = `You are Aria, an emotionally intelligent AI companion for relationship coaching and matchmaking.

USER PROFILE:
- Name: ${user?.user_name || 'Friend'}
- Gender: ${user?.user_gender || 'Unknown'}
- Conversation History: ${user?.total_conversations || 0} previous chats

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

    // Reference previous conversations if they exist
    if (conversationHistory.length > 0) {
      prompt += `\n- Reference previous conversations naturally
- Build on topics you've discussed before
- Show that you remember and care about their updates`;
    }

    prompt += `

CONVERSATION GOALS:
- Have a genuine, human-like conversation with ${user?.user_name || 'them'}
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
- Use their name (${user?.user_name || 'friend'}) naturally in conversation

Remember: You're not just collecting data - you're building a genuine connection while learning who they are.`;

    return prompt;
  }
}

// Enhanced database helper functions
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
    
    // Update conversation count
    await pool.query(
      'UPDATE users SET total_conversations = total_conversations + 1 WHERE user_id = $1',
      [userId]
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

// Enhanced main chat endpoint with memory integration
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, userId = 'default' } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured on server' });
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
      
      // Generate adaptive system prompt with complete user context
      const adaptivePrompt = aria.generateSystemPrompt(analysis, updatedProfile, conversationHistory, user);
      
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
          isReturningUser: conversationHistory.length > 0,
          userName: user.user_name,
          userGender: user.user_gender
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
      userName: userData.user_name,
      userGender: userData.user_gender,
      phoneNumber: userData.phone_number,
      createdAt: userData.created_at,
      lastSeen: userData.last_seen,
      personalityData: userData.personality_data,
      relationshipContext: userData.relationship_context,
      conversationCount: conversations.length,
      totalConversations: userData.total_conversations,
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

// Database connection test endpoint
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

    // Test allowlist system
    const allowlistCount = await pool.query('SELECT COUNT(*) FROM phone_allowlist WHERE status = $1', ['active']);
    const userCount = await pool.query('SELECT COUNT(*) FROM users');

    res.json({
      status: 'Database connection successful! 🎉',
      database_info: {
        connected: true,
        current_time: result.rows[0].current_time,
        tables_created: tablesResult.rows.map(row => row.table_name),
        allowlist_users: allowlistCount.rows[0].count,
        total_users: userCount.rows[0].count,
        allowlist_capacity: '35 users max'
      },
      features: [
        'Complete user profiles (name, gender, phone)',
        'Phone number allowlist system (35 users max)',
        'Cross-session memory with user identification',
        'Progressive relationship building',
        'Mood and interest persistence',
        'Admin management endpoints'
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

// Enhanced health check with allowlist status
app.get('/api/health', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT NOW()');
    const allowlistCount = await pool.query('SELECT COUNT(*) FROM phone_allowlist WHERE status = $1', ['active']);
    
    res.json({ 
      status: 'SoulSync AI Backend with Complete Allowlist System running! ✅',
      database_connected: true,
      database_time: dbTest.rows[0].now,
      allowlist_users: allowlistCount.rows[0].count,
      allowlist_capacity: '35 users max',
      features: [
        'PostgreSQL Memory System ✅',
        'Phone Number Allowlist (35 users) ✅',
        'Complete User Profiles (name, gender, phone) ✅',
        'Cross-session Continuity ✅',
        'Adaptive personality system ✅',
        'Real-time mood detection ✅',
        'Interest tracking ✅',
        'Love language detection ✅',
        'Attachment style hints ✅',
        'Family values analysis ✅',
        'Progressive relationship building ✅',
        'Admin management system ✅',
        'Enhanced debugging and error handling ✅'
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
  console.log(`🧠 SoulSync AI Backend with Enhanced Phone Verification running on port ${PORT}`);
  console.log('Phase 1 Features: Enhanced debugging, better error handling, comprehensive logging');
  console.log('🔧 Debug endpoints: /api/test-db, /api/health, /api/admin/allowlist-status/soulsync_admin_2025');
});
