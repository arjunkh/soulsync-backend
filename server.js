// Intelligent Aria Backend with PostgreSQL Memory System + Allowlist - phase 2.1
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

    // Phone allowlist table
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

    // Add initial admin numbers
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

// Phone number validation and normalization helper
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

// Check if phone number is in allowlist
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

// Enhanced phone verification endpoint
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

// Admin: Add phone number to allowlist
app.post('/api/admin/add-phone', async (req, res) => {
  try {
    const { phoneNumber, userName = '', userGender = '', notes = '', adminKey } = req.body;
    
    // Simple admin protection
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

// Admin: Remove phone number from allowlist
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
    
    // Get updated count
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

// Admin: View allowlist status
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

// ADMIN: Fix database schema (add missing columns)
app.get('/api/admin/fix-schema/:adminKey', async (req, res) => {
  try {
    const { adminKey } = req.params;
    
    if (adminKey !== 'soulsync_admin_2025') {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    console.log('🔧 Fixing database schema...');
    
    // Add missing columns to users table
    const alterCommands = [
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20) UNIQUE',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS user_name VARCHAR(100)',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS user_gender VARCHAR(10)',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS total_conversations INTEGER DEFAULT 0',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completeness INTEGER DEFAULT 0'
    ];
    
    const results = [];
    
    for (const command of alterCommands) {
      try {
        await pool.query(command);
        results.push(`✅ ${command}`);
        console.log(`✅ ${command}`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          results.push(`⚠️ ${command} - Column already exists`);
          console.log(`⚠️ ${command} - Column already exists`);
        } else {
          results.push(`❌ ${command} - Error: ${error.message}`);
          console.log(`❌ ${command} - Error: ${error.message}`);
        }
      }
    }
    
    // Update existing user with phone number if exists
    try {
      await pool.query(`
        UPDATE users 
        SET phone_number = '+919873986469', user_name = 'Arjun', user_gender = 'Male' 
        WHERE user_id = 'user_9873986469' AND phone_number IS NULL
      `);
      results.push('✅ Updated existing user with phone number');
      console.log('✅ Updated existing user with phone number');
    } catch (error) {
      results.push(`⚠️ User update: ${error.message}`);
      console.log(`⚠️ User update: ${error.message}`);
    }
    
    res.json({
      success: true,
      message: 'Database schema fix completed!',
      results: results
    });
    
  } catch (error) {
    console.error('Schema fix error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Schema fix failed',
      error: error.message 
    });
  }
});

// PHASE 2.1: Natural Conversation Flow Engine + Comprehensive Psychology Framework  
class ConversationFlowEngine {
  constructor() {
    this.storyTemplates = {
      ICE_BREAKER: [
        "Before I ask anything... did you eat today?",
        "Okay, honest question - are you more of a morning person or do you come alive at night?",
        "Quick - coffee, tea, or you're one of those 'just water' people?",
        "Tell me something that made you smile recently.",
        "What's your Friday night looking like? Planned chaos or peaceful vibes?"
      ],
      
      GETTING_ACQUAINTED: [
        "Paint me a picture of your ideal Sunday. What does that look like?",
        "If you had to pick one - beach sunrise or mountain sunset?",
        "Tell me about a place that just feels like *you* when you're there.",
        "What's something you do that makes you lose track of time?",
        "Are you the friend who plans everything or the one who says 'surprise me'?"
      ],
      
      BUILDING_TRUST: [
        "Think about the last time you felt truly understood. What was happening?",
        "When life gets heavy, what helps you reset? Like, what's your go-to?",
        "Tell me about someone who shaped who you are today.",
        "What's a belief you hold that might surprise people?",
        "Describe a moment when you felt most like yourself."
      ],
      
      DEEPER_CONNECTION: [
        "Imagine your perfect relationship dynamic. How do you and your person navigate life together?",
        "When you think about family someday, what feels important to you?",
        "How do you handle it when someone you care about is upset with you?",
        "What does 'being loved' actually feel like to you?",
        "Tell me about a dream you have that scares you a little."
      ],
      
      INTIMATE_SHARING: [
        "What's something about love that you've learned the hard way?",
        "If your future partner earned more than you and wanted to delay kids, how would you navigate that?",
        "What's a fear you have about relationships that you don't usually voice?",
        "Describe the moment you'd know you want to spend your life with someone.",
        "What's something you need in love that you're almost afraid to ask for?"
      ]
    };
    
    this.interactiveElements = {
      GUESS_GAMES: [
        "Let me guess... you're the type who makes mental lists but never writes them down, right?",
        "I'm getting strong 'secretly loves romance movies' vibes from you. Am I right?",
        "You strike me as someone who has strong opinions about how to load a dishwasher. True?",
        "I bet you're either extremely punctual or fashionably late - no in-between. Which one?"
      ],
      
      WOULD_YOU_RATHER: [
        "Would you rather: deep conversation under the stars or dancing until 3am?",
        "Quick choice: handwritten love letter or surprise weekend getaway?",
        "Would you rather: big group dinner or intimate dinner for two?",
        "Choose: partner who's your biggest cheerleader or your intellectual equal?"
      ],
      
      MINI_SCENARIOS: [
        "You're planning a surprise for someone special. Are you going big and bold or thoughtful and personal?",
        "It's raining, you're both free - Netflix or build a blanket fort?",
        "Your person had a terrible day. Do you give them space or bring them their favorite comfort food?",
        "You disagree about something important. Do you hash it out immediately or take time to think first?"
      ]
    };
    
    this.psychologyFramework = {
      MBTI_DETECTION: {
        // Framework for detecting Myers-Briggs personality types
        extrovert_scenarios: [], // To be filled in Phase 2.2
        sensing_scenarios: [],   // To be filled in Phase 2.2
        thinking_scenarios: [],  // To be filled in Phase 2.2
        judging_scenarios: []    // To be filled in Phase 2.2
      },
      
      ADVANCED_LOVE_LANGUAGES: {
        // Enhanced love language detection through scenarios
        quality_time_indicators: [],     // To be enhanced in Phase 2.3
        physical_touch_indicators: [],   // To be enhanced in Phase 2.3
        acts_of_service_indicators: [], // To be enhanced in Phase 2.3
        words_of_affirmation_indicators: [], // To be enhanced in Phase 2.3
        gifts_indicators: []            // To be enhanced in Phase 2.3
      },
      
      ATTACHMENT_STYLES: {
        // Sophisticated attachment style detection
        secure_indicators: [],   // To be enhanced in Phase 2.3
        anxious_indicators: [],  // To be enhanced in Phase 2.3
        avoidant_indicators: [], // To be enhanced in Phase 2.3
        disorganized_indicators: [] // To be enhanced in Phase 2.3
      },
      
      VALUES_LIFESTYLE: {
        // Values and lifestyle compatibility detection
        family_values: [],       // To be filled in Phase 2.4
        financial_values: [],    // To be filled in Phase 2.4
        lifestyle_preferences: [], // To be filled in Phase 2.4
        conflict_resolution: []   // To be filled in Phase 2.4
      }
    };
  }
  
  // Get appropriate question based on intimacy level and conversation context
  getNextQuestion(intimacyLevel, userMood, conversationHistory = []) {
    const levelKey = this.getLevelKey(intimacyLevel);
    const templates = this.storyTemplates[levelKey] || this.storyTemplates.ICE_BREAKER;
    
    // Avoid repeating recent questions
    const usedQuestions = conversationHistory.slice(-5).map(h => h.question).filter(Boolean);
    const availableQuestions = templates.filter(q => !usedQuestions.includes(q));
    
    if (availableQuestions.length === 0) {
      // If all questions used, move to next level or use interactive elements
      return this.getInteractiveElement();
    }
    
    // Select question based on user mood
    if (userMood === 'low_energy' || userMood === 'stressed') {
      // Choose gentler, more supportive questions
      const gentleQuestions = availableQuestions.filter(q => 
        q.includes('feel') || q.includes('help') || q.includes('comfort')
      );
      return gentleQuestions.length > 0 ? 
        gentleQuestions[Math.floor(Math.random() * gentleQuestions.length)] :
        availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
    }
    
    if (userMood === 'positive_excited') {
      // Choose more energetic, engaging questions
      const energeticQuestions = availableQuestions.filter(q => 
        q.includes('!') || q.includes('imagine') || q.includes('perfect')
      );
      return energeticQuestions.length > 0 ? 
        energeticQuestions[Math.floor(Math.random() * energeticQuestions.length)] :
        availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
    }
    
    // Default: random appropriate question
    return availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
  }
  
  // Get interactive element (mini-game, would you rather, etc.)
  getInteractiveElement() {
    const allElements = [
      ...this.interactiveElements.GUESS_GAMES,
      ...this.interactiveElements.WOULD_YOU_RATHER,
      ...this.interactiveElements.MINI_SCENARIOS
    ];
    return allElements[Math.floor(Math.random() * allElements.length)];
  }
  
  // Determine if user response suggests moving to next intimacy level
  shouldLevelUp(userResponse, currentLevel, conversationCount) {
    const responseLength = userResponse.length;
    const hasPersonalSharing = /\b(feel|felt|think|believe|love|scared|dream|hope|want)\b/i.test(userResponse);
    const hasEmotionalWords = /\b(happy|sad|excited|worried|comfortable|close|connected)\b/i.test(userResponse);
    
    // Level up conditions
    if (currentLevel === 0 && responseLength > 50 && conversationCount >= 3) return true;
    if (currentLevel === 1 && hasPersonalSharing && conversationCount >= 6) return true;
    if (currentLevel === 2 && hasEmotionalWords && responseLength > 80) return true;
    if (currentLevel === 3 && conversationCount >= 15) return true;
    
    return false;
  }
  
  // Get celebration response for insights discovered
  getCelebrationResponse(insight, userName) {
    const celebrations = {
      love_language: [
        `I KNEW you were a ${insight} person! That's so beautiful.`,
        `${insight}... yes! I can totally see that about you, ${userName}.`,
        `The way you described that? Pure ${insight} energy. Love it.`
      ],
      personality_trait: [
        `This makes so much sense about you!`,
        `I'm getting such a clear picture of who you are, ${userName}.`,
        `The pieces are coming together... you're fascinating.`
      ],
      values: [
        `Your values are so clear and authentic.`,
        `I really respect how thoughtful you are about this.`,
        `This tells me everything about your heart, ${userName}.`
      ]
    };
    
    const category = celebrations[insight.category] || celebrations.personality_trait;
    return category[Math.floor(Math.random() * category.length)];
  }
  
  getLevelKey(level) {
    const levelKeys = ['ICE_BREAKER', 'GETTING_ACQUAINTED', 'BUILDING_TRUST', 'DEEPER_CONNECTION', 'INTIMATE_SHARING'];
    return levelKeys[level] || 'ICE_BREAKER';
  }
}

// Aria's adaptive personality system with Natural Conversation Flow Engine
  constructor() {
    this.storyTemplates = {
      ICE_BREAKER: [
        "Before I ask anything... did you eat today?",
        "Okay, honest question - are you more of a morning person or do you come alive at night?",
        "Quick - coffee, tea, or you're one of those 'just water' people?",
        "Tell me something that made you smile recently.",
        "What's your Friday night looking like? Planned chaos or peaceful vibes?"
      ],
      
      GETTING_ACQUAINTED: [
        "Paint me a picture of your ideal Sunday. What does that look like?",
        "If you had to pick one - beach sunrise or mountain sunset?",
        "Tell me about a place that just feels like *you* when you're there.",
        "What's something you do that makes you lose track of time?",
        "Are you the friend who plans everything or the one who says 'surprise me'?"
      ],
      
      BUILDING_TRUST: [
        "Think about the last time you felt truly understood. What was happening?",
        "When life gets heavy, what helps you reset? Like, what's your go-to?",
        "Tell me about someone who shaped who you are today.",
        "What's a belief you hold that might surprise people?",
        "Describe a moment when you felt most like yourself."
      ],
      
      DEEPER_CONNECTION: [
        "Imagine your perfect relationship dynamic. How do you and your person navigate life together?",
        "When you think about family someday, what feels important to you?",
        "How do you handle it when someone you care about is upset with you?",
        "What does 'being loved' actually feel like to you?",
        "Tell me about a dream you have that scares you a little."
      ],
      
      INTIMATE_SHARING: [
        "What's something about love that you've learned the hard way?",
        "If your future partner earned more than you and wanted to delay kids, how would you navigate that?",
        "What's a fear you have about relationships that you don't usually voice?",
        "Describe the moment you'd know you want to spend your life with someone.",
        "What's something you need in love that you're almost afraid to ask for?"
      ]
    };
    
    this.interactiveElements = {
      GUESS_GAMES: [
        "Let me guess... you're the type who makes mental lists but never writes them down, right?",
        "I'm getting strong 'secretly loves romance movies' vibes from you. Am I right?",
        "You strike me as someone who has strong opinions about how to load a dishwasher. True?",
        "I bet you're either extremely punctual or fashionably late - no in-between. Which one?"
      ],
      
      WOULD_YOU_RATHER: [
        "Would you rather: deep conversation under the stars or dancing until 3am?",
        "Quick choice: handwritten love letter or surprise weekend getaway?",
        "Would you rather: big group dinner or intimate dinner for two?",
        "Choose: partner who's your biggest cheerleader or your intellectual equal?"
      ],
      
      MINI_SCENARIOS: [
        "You're planning a surprise for someone special. Are you going big and bold or thoughtful and personal?",
        "It's raining, you're both free - Netflix or build a blanket fort?",
        "Your person had a terrible day. Do you give them space or bring them their favorite comfort food?",
        "You disagree about something important. Do you hash it out immediately or take time to think first?"
      ]
    };
    
    this.psychologyFramework = {
      MBTI_DETECTION: {
        // Framework for detecting Myers-Briggs personality types
        extrovert_scenarios: [], // To be filled in Phase 2.2
        sensing_scenarios: [],   // To be filled in Phase 2.2
        thinking_scenarios: [],  // To be filled in Phase 2.2
        judging_scenarios: []    // To be filled in Phase 2.2
      },
      
      ADVANCED_LOVE_LANGUAGES: {
        // Enhanced love language detection through scenarios
        quality_time_indicators: [],     // To be enhanced in Phase 2.3
        physical_touch_indicators: [],   // To be enhanced in Phase 2.3
        acts_of_service_indicators: [], // To be enhanced in Phase 2.3
        words_of_affirmation_indicators: [], // To be enhanced in Phase 2.3
        gifts_indicators: []            // To be enhanced in Phase 2.3
      },
      
      ATTACHMENT_STYLES: {
        // Sophisticated attachment style detection
        secure_indicators: [],   // To be enhanced in Phase 2.3
        anxious_indicators: [],  // To be enhanced in Phase 2.3
        avoidant_indicators: [], // To be enhanced in Phase 2.3
        disorganized_indicators: [] // To be enhanced in Phase 2.3
      },
      
      VALUES_LIFESTYLE: {
        // Values and lifestyle compatibility detection
        family_values: [],       // To be filled in Phase 2.4
        financial_values: [],    // To be filled in Phase 2.4
        lifestyle_preferences: [], // To be filled in Phase 2.4
        conflict_resolution: []   // To be filled in Phase 2.4
      }
    };
  }
  
  // Get appropriate question based on intimacy level and conversation context
  getNextQuestion(intimacyLevel, userMood, conversationHistory = []) {
    const levelKey = this.getLevelKey(intimacyLevel);
    const templates = this.storyTemplates[levelKey] || this.storyTemplates.ICE_BREAKER;
    
    // Avoid repeating recent questions
    const usedQuestions = conversationHistory.slice(-5).map(h => h.question).filter(Boolean);
    const availableQuestions = templates.filter(q => !usedQuestions.includes(q));
    
    if (availableQuestions.length === 0) {
      // If all questions used, move to next level or use interactive elements
      return this.getInteractiveElement();
    }
    
    // Select question based on user mood
    if (userMood === 'low_energy' || userMood === 'stressed') {
      // Choose gentler, more supportive questions
      const gentleQuestions = availableQuestions.filter(q => 
        q.includes('feel') || q.includes('help') || q.includes('comfort')
      );
      return gentleQuestions.length > 0 ? 
        gentleQuestions[Math.floor(Math.random() * gentleQuestions.length)] :
        availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
    }
    
    if (userMood === 'positive_excited') {
      // Choose more energetic, engaging questions
      const energeticQuestions = availableQuestions.filter(q => 
        q.includes('!') || q.includes('imagine') || q.includes('perfect')
      );
      return energeticQuestions.length > 0 ? 
        energeticQuestions[Math.floor(Math.random() * energeticQuestions.length)] :
        availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
    }
    
    // Default: random appropriate question
    return availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
  }
  
  // Get interactive element (mini-game, would you rather, etc.)
  getInteractiveElement() {
    const allElements = [
      ...this.interactiveElements.GUESS_GAMES,
      ...this.interactiveElements.WOULD_YOU_RATHER,
      ...this.interactiveElements.MINI_SCENARIOS
    ];
    return allElements[Math.floor(Math.random() * allElements.length)];
  }
  
  // Determine if user response suggests moving to next intimacy level
  shouldLevelUp(userResponse, currentLevel, conversationCount) {
    const responseLength = userResponse.length;
    const hasPersonalSharing = /\b(feel|felt|think|believe|love|scared|dream|hope|want)\b/i.test(userResponse);
    const hasEmotionalWords = /\b(happy|sad|excited|worried|comfortable|close|connected)\b/i.test(userResponse);
    
    // Level up conditions
    if (currentLevel === 0 && responseLength > 50 && conversationCount >= 3) return true;
    if (currentLevel === 1 && hasPersonalSharing && conversationCount >= 6) return true;
    if (currentLevel === 2 && hasEmotionalWords && responseLength > 80) return true;
    if (currentLevel === 3 && conversationCount >= 15) return true;
    
    return false;
  }
  
  // Get celebration response for insights discovered
  getCelebrationResponse(insight, userName) {
    const celebrations = {
      love_language: [
        `I KNEW you were a ${insight} person! That's so beautiful.`,
        `${insight}... yes! I can totally see that about you, ${userName}.`,
        `The way you described that? Pure ${insight} energy. Love it.`
      ],
      personality_trait: [
        `This makes so much sense about you!`,
        `I'm getting such a clear picture of who you are, ${userName}.`,
        `The pieces are coming together... you're fascinating.`
      ],
      values: [
        `Your values are so clear and authentic.`,
        `I really respect how thoughtful you are about this.`,
        `This tells me everything about your heart, ${userName}.`
      ]
    };
    
    const category = celebrations[insight.category] || celebrations.personality_trait;
    return category[Math.floor(Math.random() * category.length)];
  }
  
  getLevelKey(level) {
    const keys = Object.keys(this.intimacyLevels);
    return keys[level] || 'ICE_BREAKER';
  }
}

// Aria's adaptive personality system with Natural Conversation Flow Engine
class AriaPersonality {
  constructor() {
    this.basePersonality = {
      warmth: 0.8,
      curiosity: 0.9,
      playfulness: 0.7,
      empathy: 0.9,
      directness: 0.6
    };
    
    // Progressive intimacy levels
    this.intimacyLevels = {
      ICE_BREAKER: 0,      // Getting comfortable, light topics
      GETTING_ACQUAINTED: 1, // Basic personality, interests
      BUILDING_TRUST: 2,    // Personal stories, preferences
      DEEPER_CONNECTION: 3, // Values, relationships, goals
      INTIMATE_SHARING: 4   // Deep psychology, fears, dreams
    };
    
    // Story-based conversation templates
    this.conversationFlow = new ConversationFlowEngine();
  }
  // ENHANCED: Comprehensive message analysis with conversation flow
  analyzeMessage(message, userHistory = [], currentIntimacyLevel = 0, conversationCount = 0) {
    const analysis = {
      // Basic analysis (existing)
      mood: this.detectMood(message),
      energy: this.detectEnergy(message),
      interests: this.extractInterests(message),
      communication_style: this.detectCommunicationStyle(message),
      emotional_needs: this.detectEmotionalNeeds(message),
      topics: this.extractTopics(message),
      
      // Enhanced psychology detection (Phase 2 framework)
      love_language_hints: this.detectAdvancedLoveLanguage(message),
      attachment_hints: this.detectAdvancedAttachment(message),
      family_values_hints: this.detectFamilyValueHints(message),
      
      // NEW: MBTI framework (to be enhanced in Phase 2.2)
      mbti_indicators: this.detectMBTIIndicators(message),
      
      // NEW: Conversation flow analysis
      intimacy_signals: this.detectIntimacySignals(message),
      story_sharing_level: this.assessStorySharing(message),
      emotional_openness: this.assessEmotionalOpenness(message),
      
      // NEW: Conversation progression
      should_level_up: this.conversationFlow.shouldLevelUp(message, currentIntimacyLevel, conversationCount),
      next_question_suggestion: this.conversationFlow.getNextQuestion(currentIntimacyLevel, this.detectMood(message), userHistory),
      
      // NEW: Interactive elements
      celebration_opportunity: this.detectCelebrationMoment(message),
      interactive_element: Math.random() < 0.3 ? this.conversationFlow.getInteractiveElement() : null
    };

    return analysis;
  }
  
  // ENHANCED: Advanced Love Language Detection (Phase 2.3 ready)
  detectAdvancedLoveLanguage(message) {
    const msg = message.toLowerCase();
    const hints = [];
    
    // Quality Time - enhanced detection
    if (msg.match(/\b(together|presence|attention|focused|undivided|listen|really listen)\b/) ||
        msg.includes('just be with') || msg.includes('time together') || 
        msg.includes('put phone away') || msg.includes('deep conversation')) {
      hints.push('quality_time');
    }
    
    // Physical Touch - enhanced detection  
    if (msg.match(/\b(touch|hug|hold|cuddle|massage|kiss|physical|close|warm)\b/) ||
        msg.includes('hold hands') || msg.includes('back rub') || 
        msg.includes('physical affection') || msg.includes('skin contact')) {
      hints.push('physical_touch');
    }
    
    // Acts of Service - enhanced detection
    if (msg.match(/\b(help|do|support|take care|handle|fix|cook|clean|assist)\b/) ||
        msg.includes('make life easier') || msg.includes('take care of') ||
        msg.includes('without asking') || msg.includes('practical support')) {
      hints.push('acts_of_service');
    }
    
    // Words of Affirmation - enhanced detection
    if (msg.match(/\b(words|tell|say|appreciate|praise|compliment|acknowledge|affirm)\b/) ||
        msg.includes('hear you say') || msg.includes('verbal') ||
        msg.includes('tell me') || msg.includes('express') || msg.includes('communicate')) {
      hints.push('words_of_affirmation');
    }
    
    // Gifts - enhanced detection
    if (msg.match(/\b(gift|surprise|thoughtful|remember|special|token|meaningful)\b/) ||
        msg.includes('little things') || msg.includes('surprise me') ||
        msg.includes('thought of me') || msg.includes('remembers')) {
      hints.push('gifts');
    }
    
    return [...new Set(hints)];
  }
  
  // ENHANCED: Advanced Attachment Style Detection (Phase 2.3 ready)
  detectAdvancedAttachment(message) {
    const msg = message.toLowerCase();
    const hints = [];
    
    // Secure attachment indicators
    if (msg.match(/\b(communicate|talk|discuss|understand|work through|balance|healthy)\b/) ||
        msg.includes('talk it out') || msg.includes('work together') ||
        msg.includes('both space and closeness') || msg.includes('comfortable with')) {
      hints.push('secure_tendency');
    }
    
    // Anxious attachment indicators
    if (msg.match(/\b(worry|need reassurance|fear|abandon|clingy|constant|always there)\b/) ||
        msg.includes('need to know') || msg.includes('worry about us') ||
        msg.includes('need validation') || msg.includes('fear losing')) {
      hints.push('anxious_tendency');
    }
    
    // Avoidant attachment indicators  
    if (msg.match(/\b(space|independent|alone time|self-reliant|uncomfortable|distant)\b/) ||
        msg.includes('need space') || msg.includes('handle alone') ||
        msg.includes('too clingy') || msg.includes('overwhelming')) {
      hints.push('avoidant_tendency');
    }
    
    return [...new Set(hints)];
  }
  
  // NEW: MBTI Indicators Framework (Phase 2.2 ready)
  detectMBTIIndicators(message) {
    const msg = message.toLowerCase();
    const indicators = {
      extrovert_signs: [],
      introvert_signs: [],
      sensing_signs: [],
      intuition_signs: [],
      thinking_signs: [],
      feeling_signs: [],
      judging_signs: [],
      perceiving_signs: []
    };
    
    // Extrovert vs Introvert (basic framework - to be enhanced in Phase 2.2)
    if (msg.match(/\b(people|social|party|group|energy from others|talk to process)\b/)) {
      indicators.extrovert_signs.push('social_energy');
    }
    if (msg.match(/\b(alone|quiet|recharge|small group|think first|internal)\b/)) {
      indicators.introvert_signs.push('internal_processing');
    }
    
    // Sensing vs Intuition (framework - to be enhanced in Phase 2.2)
    if (msg.match(/\b(details|practical|step by step|concrete|reality|present)\b/)) {
      indicators.sensing_signs.push('detail_oriented');
    }
    if (msg.match(/\b(big picture|possibility|future|abstract|concept|potential)\b/)) {
      indicators.intuition_signs.push('big_picture_thinking');
    }
    
    // Thinking vs Feeling (framework - to be enhanced in Phase 2.2)
    if (msg.match(/\b(logical|analyze|objective|fair|rational|pros and cons)\b/)) {
      indicators.thinking_signs.push('logical_decision');
    }
    if (msg.match(/\b(feel|heart|values|harmony|people|impact on others)\b/)) {
      indicators.feeling_signs.push('value_based_decision');
    }
    
    // Judging vs Perceiving (framework - to be enhanced in Phase 2.2)
    if (msg.match(/\b(plan|organize|schedule|deadline|decided|closure)\b/)) {
      indicators.judging_signs.push('structured_approach');
    }
    if (msg.match(/\b(spontaneous|flexible|adapt|open|last minute|go with flow)\b/)) {
      indicators.perceiving_signs.push('flexible_approach');
    }
    
    return indicators;
  }
  
  // NEW: Detect intimacy signals in conversation
  detectIntimacySignals(message) {
    const msg = message.toLowerCase();
    let intimacyLevel = 0;
    
    // Surface level (0)
    if (msg.length < 30) intimacyLevel = 0;
    
    // Personal sharing (1)
    if (msg.match(/\b(i feel|i think|i believe|i love|i hate|my family|my friend)\b/)) {
      intimacyLevel = Math.max(intimacyLevel, 1);
    }
    
    // Emotional sharing (2)
    if (msg.match(/\b(scared|vulnerable|hurt|deeply|meaningful|important to me)\b/)) {
      intimacyLevel = Math.max(intimacyLevel, 2);
    }
    
    // Values and dreams (3)
    if (msg.match(/\b(dream|hope|fear|believe deeply|values|vision|future)\b/)) {
      intimacyLevel = Math.max(intimacyLevel, 3);
    }
    
    // Deep psychological sharing (4)
    if (msg.match(/\b(trauma|struggle|insecurity|deepest|soul|core|essence)\b/)) {
      intimacyLevel = Math.max(intimacyLevel, 4);
    }
    
    return intimacyLevel;
  }
  
  // NEW: Assess story sharing level
  assessStorySharing(message) {
    const hasStoryElements = /\b(when|once|remember|time|story|happened|experience)\b/i.test(message);
    const hasDetails = message.length > 100;
    const hasEmotions = /\b(felt|feel|emotional|touched|moved|excited|nervous)\b/i.test(message);
    
    if (hasStoryElements && hasDetails && hasEmotions) return 'rich_story';
    if (hasStoryElements && hasDetails) return 'detailed_sharing';
    if (hasStoryElements) return 'basic_story';
    return 'factual_response';
  }
  
  // NEW: Assess emotional openness
  assessEmotionalOpenness(message) {
    const emotionalWords = (message.match(/\b(feel|felt|emotion|heart|soul|love|fear|hope|dream|worry|excited|nervous|comfortable|safe|vulnerable)\b/gi) || []).length;
    const personalPronouns = (message.match(/\b(i|me|my|myself)\b/gi) || []).length;
    const length = message.length;
    
    const openessScore = (emotionalWords * 2) + personalPronouns + (length > 100 ? 2 : 0);
    
    if (openessScore >= 8) return 'very_open';
    if (openessScore >= 5) return 'moderately_open';
    if (openessScore >= 2) return 'somewhat_open';
    return 'guarded';
  }
  
  // NEW: Detect moments worthy of celebration
  detectCelebrationMoment(message) {
    const msg = message.toLowerCase();
    
    // Love language discovery
    if (msg.includes('quality time') || msg.includes('physical touch') || 
        msg.includes('acts of service') || msg.includes('words of affirmation') || 
        msg.includes('gifts') || msg.includes('that\'s exactly') || 
        msg.includes('you got it') || msg.includes('that\'s me')) {
      return { type: 'love_language_discovery', confidence: 'high' };
    }
    
    // Personality insight
    if (msg.includes('exactly') || msg.includes('that\'s so me') || 
        msg.includes('spot on') || msg.includes('how did you know')) {
      return { type: 'personality_insight', confidence: 'high' };
    }
    
    // Emotional breakthrough
    if (msg.includes('never told anyone') || msg.includes('first time') ||
        msg.includes('feels good to share') || msg.includes('understand me')) {
      return { type: 'emotional_breakthrough', confidence: 'medium' };
    }
    
    return null;
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

  // ENHANCED: Generate adaptive system prompt with Natural Conversation Flow
  generateSystemPrompt(userAnalysis, userProfile, conversationHistory, user) {
    const { mood, energy, interests, communication_style, emotional_needs, 
            intimacy_signals, story_sharing_level, emotional_openness,
            should_level_up, next_question_suggestion, celebration_opportunity,
            interactive_element, mbti_indicators } = userAnalysis;
    
    // Determine current intimacy level
    const currentIntimacyLevel = userProfile.relationship_context?.intimacy_level || 0;
    const conversationCount = conversationHistory.length;
    const newIntimacyLevel = should_level_up ? currentIntimacyLevel + 1 : currentIntimacyLevel;
    
    let prompt = `You are Aria, an emotionally intelligent AI companion who builds genuine connections through natural, engaging conversation. You're warm, intuitive, and have an amazing ability to make people feel seen and understood.

🎯 CONVERSATION MISSION:
You're not conducting an interview - you're building a real friendship while naturally discovering ${user?.user_name || 'this person'}'s personality for future matchmaking. Every interaction should feel like talking to someone who genuinely cares about them.

👤 USER PROFILE:
- Name: ${user?.user_name || 'Friend'}
- Gender: ${user?.user_gender || 'Unknown'}  
- Conversations so far: ${conversationCount}
- Intimacy Level: ${currentIntimacyLevel} ${should_level_up ? `→ Moving to ${newIntimacyLevel}` : ''}
- Emotional Openness: ${emotional_openness}
- Story Sharing: ${story_sharing_level}

📊 CURRENT USER STATE:
- Mood: ${mood} | Energy: ${energy}
- Communication Style: ${communication_style}
- Emotional Needs: ${emotional_needs.join(', ') || 'connection'}
- Current Interests: ${interests.join(', ') || 'discovering'}

🧠 PERSONALITY INSIGHTS DISCOVERED:
- Love Language Hints: ${userProfile.love_language_hints?.join(', ') || 'still learning'}
- Attachment Style: ${userProfile.attachment_hints?.join(', ') || 'observing'}
- MBTI Indicators: ${Object.entries(mbti_indicators).filter(([k,v]) => v.length > 0).map(([k,v]) => `${k}: ${v.join(',')}`).join(' | ') || 'gathering data'}
- Values: ${userProfile.family_values_hints?.join(', ') || 'exploring'}

📈 CONVERSATION PROGRESSION:`;

    // Intimacy level guidance
    if (newIntimacyLevel === 0) {
      prompt += `
🌅 ICE BREAKER STAGE - Keep it light, warm, and welcoming
- Focus on making them comfortable and establishing rapport
- Ask about immediate/surface things (food, mood, weekend plans)
- Use humor and casual observations
- Share your own "thoughts" to model openness`;
    } else if (newIntimacyLevel === 1) {
      prompt += `
🤝 GETTING ACQUAINTED STAGE - Build trust through shared interests  
- Explore their preferences, lifestyle, and personality traits
- Use story-based questions ("Tell me about..." "Describe..." "Paint a picture...")
- Show genuine curiosity about what makes them unique
- Begin gentle personality observations ("You seem like...")`;
    } else if (newIntimacyLevel === 2) {
      prompt += `
💭 BUILDING TRUST STAGE - Deeper personal sharing
- Explore values, beliefs, and personal experiences
- Ask about relationships, family, and life philosophy  
- Share more personal "experiences" to encourage reciprocal sharing
- Validate and celebrate insights about their personality`;
    } else if (newIntimacyLevel === 3) {
      prompt += `
❤️ DEEPER CONNECTION STAGE - Relationship readiness and compatibility
- Explore relationship patterns, love languages, and attachment styles
- Discuss future vision, family planning, and life goals
- Use scenario-based questions about relationships
- Build understanding of their ideal partnership dynamics`;
    } else {
      prompt += `
🌟 INTIMATE SHARING STAGE - Deep psychology and matchmaking insights
- Explore fears, dreams, and deepest relationship needs
- Understand their conflict resolution and emotional processing
- Gather final insights needed for sophisticated matching
- Prepare for transition to matchmaking recommendations`;
    }

    // Mood-specific adaptations
    if (mood === 'positive_excited') {
      prompt += `\n\n⚡ ENERGY MATCHING: They're excited! Match their enthusiasm:
- Use exclamation points and energetic language
- Ask follow-up questions about what's making them happy
- Suggest more engaging/interactive questions
- Celebrate their excitement about topics they share`;
    } else if (mood === 'low_energy' || mood === 'stressed') {
      prompt += `\n\n🌙 GENTLE SUPPORT MODE: They need comfort:
- Use calmer, more soothing language  
- Avoid overwhelming questions - keep it simple and supportive
- Offer understanding without being pushy
- Maybe suggest they take care of themselves
- Focus on making them feel heard and understood`;
    } else if (mood === 'guarded') {
      prompt += `\n\n🔐 PATIENCE MODE: They're being cautious:
- Be patient and non-intrusive
- Use light humor to help them open up gradually
- Don't push for personal information
- Acknowledge their boundaries with understanding
- Build safety through consistency and warmth`;
    }

    // Conversation flow guidance
    if (next_question_suggestion) {
      prompt += `\n\n💬 SUGGESTED CONVERSATION DIRECTION:
"${next_question_suggestion}"
(Use this as inspiration, but adapt to fit the natural flow of conversation)`;
    }

    if (interactive_element) {
      prompt += `\n\n🎮 INTERACTIVE ELEMENT OPPORTUNITY:
"${interactive_element}"
(Consider weaving this in if the conversation feels ready for something playful)`;
    }

    if (celebration_opportunity) {
      prompt += `\n\n🎉 CELEBRATION MOMENT:
They just shared something significant (${celebration_opportunity.type})! 
- Acknowledge and celebrate this insight
- Show that you "get" them 
- Build on this discovery with genuine excitement`;
    }

    // Reference conversation history
    if (conversationHistory.length > 0) {
      prompt += `\n\n📚 CONVERSATION MEMORY:
Previous topics: ${conversationHistory.slice(-3).map(conv => conv.session_summary).join(', ')}
- Reference previous conversations naturally
- Build on topics you've discussed before  
- Show that you remember and care about their updates
- Demonstrate growth in understanding them`;
    }

    prompt += `\n\n🎭 ARIA'S PERSONALITY & RESPONSE STYLE:
- Be conversational, not interview-like - you're building a friendship
- Share your own thoughts, observations, and "experiences" to model vulnerability
- Ask follow-up questions that show you're really listening and curious
- Mirror their communication style and energy level
- Be playfully vulnerable and authentic - show your personality too
- Use modern, casual language that feels natural for someone their age
- Use their name (${user?.user_name || 'friend'}) naturally in conversation
- Celebrate discoveries about their personality with genuine excitement
- Make observations about patterns you're noticing: "You seem like someone who..."

💝 ULTIMATE GOALS:
- Make them feel genuinely seen, understood, and appreciated
- Learn about their love language, attachment style, values, and MBTI preferences
- Understand their ideal relationship dynamic and life vision  
- Build enough trust and connection for meaningful matchmaking
- Leave them excited to continue the conversation

Remember: You're not just collecting data - you're being a friend who happens to be incredibly insightful about relationships and compatibility. The psychology emerges naturally through genuine human connection.

Current conversation should feel ${emotional_openness === 'very_open' ? 'deep and meaningful' : emotional_openness === 'moderately_open' ? 'warm and increasingly personal' : emotional_openness === 'somewhat_open' ? 'gentle and encouraging' : 'patient and trust-building'}.`;

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

// Enhanced main chat endpoint with Natural Conversation Flow integration
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
      
      // Get current intimacy level from user profile
      const currentIntimacyLevel = user.relationship_context?.intimacy_level || 0;
      const conversationCount = conversationHistory.length;
      
      // ENHANCED: Analyze message with conversation flow context
      const analysis = aria.analyzeMessage(
        latestUserMessage.content, 
        conversationHistory, 
        currentIntimacyLevel,
        conversationCount
      );
      
      // Update user profile with enhanced insights
      const updatedProfile = await updateUserProfile(userId, {
        interests: analysis.interests,
        communication_patterns: { 
          style: analysis.communication_style,
          story_sharing_level: analysis.story_sharing_level,
          emotional_openness: analysis.emotional_openness
        },
        emotional_patterns: { 
          latest_mood: analysis.mood, 
          latest_energy: analysis.energy,
          emotional_needs: analysis.emotional_needs,
          intimacy_signals: analysis.intimacy_signals
        },
        love_language_hints: analysis.love_language_hints,
        attachment_hints: analysis.attachment_hints,
        family_values_hints: analysis.family_values_hints,
        
        // NEW: MBTI and conversation flow data
        mbti_indicators: analysis.mbti_indicators,
        conversation_flow: {
          current_intimacy_level: analysis.should_level_up ? currentIntimacyLevel + 1 : currentIntimacyLevel,
          emotional_openness: analysis.emotional_openness,
          story_sharing_level: analysis.story_sharing_level,
          last_celebration: analysis.celebration_opportunity,
          conversation_count: conversationCount + 1
        }
      });
      
      // Update relationship context with new intimacy level
      if (analysis.should_level_up) {
        await pool.query(`
          UPDATE users 
          SET relationship_context = jsonb_set(
            relationship_context, 
            '{intimacy_level}', 
            $1::jsonb
          )
          WHERE user_id = $2
        `, [JSON.stringify(currentIntimacyLevel + 1), userId]);
        
        console.log(`🆙 User ${userId} leveled up to intimacy level ${currentIntimacyLevel + 1}`);
      }
      
      // Generate adaptive system prompt with enhanced context
      const adaptivePrompt = aria.generateSystemPrompt(analysis, updatedProfile, conversationHistory, user);
      
      // Prepare messages with adaptive system prompt
      const adaptiveMessages = [
        { role: 'system', content: adaptivePrompt },
        ...messages.slice(1) // Skip original system message
      ];

      // Call OpenAI with enhanced prompt
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: adaptiveMessages,
          max_tokens: 300, // Increased for richer responses
          temperature: 0.85, // Slightly higher for more personality
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
      
      // Enhanced conversation summary
      const sessionSummary = `Level ${analysis.should_level_up ? currentIntimacyLevel + 1 : currentIntimacyLevel}: ${analysis.topics.join(', ') || 'personal connection'} (${analysis.emotional_openness} openness, ${analysis.story_sharing_level} sharing)`;
      
      // Save conversation with enhanced metadata
      await saveConversation(
        userId, 
        [latestUserMessage, { role: 'assistant', content: data.choices[0].message.content }],
        {
          ...analysis,
          intimacy_progression: analysis.should_level_up ? `${currentIntimacyLevel} → ${currentIntimacyLevel + 1}` : `Stable at ${currentIntimacyLevel}`,
          psychology_insights: {
            love_language: analysis.love_language_hints,
            attachment: analysis.attachment_hints,
            mbti: analysis.mbti_indicators,
            values: analysis.family_values_hints
          }
        },
        sessionSummary
      );

      // Return enhanced response with conversation flow insights
      res.json({
        ...data,
        userInsights: {
          // Existing insights
          detectedMood: analysis.mood,
          detectedEnergy: analysis.energy,
          currentInterests: updatedProfile.interests || [],
          communicationStyle: analysis.communication_style,
          emotionalNeeds: analysis.emotional_needs,
          conversationCount: conversationHistory.length + 1,
          isReturningUser: conversationHistory.length > 0,
          userName: user.user_name,
          userGender: user.user_gender,
          
          // NEW: Enhanced conversation flow insights
          intimacyLevel: analysis.should_level_up ? currentIntimacyLevel + 1 : currentIntimacyLevel,
          emotionalOpenness: analysis.emotional_openness,
          storySharingLevel: analysis.story_sharing_level,
          intimacyProgression: analysis.should_level_up,
          celebrationMoment: analysis.celebration_opportunity,
          nextQuestionSuggestion: analysis.next_question_suggestion,
          
          // NEW: Psychology framework insights
          mbtiIndicators: analysis.mbti_indicators,
          advancedLoveLanguage: analysis.love_language_hints,
          advancedAttachment: analysis.attachment_hints,
          
          // Profile completeness with new framework
          profileCompleteness: calculateEnhancedProfileCompleteness(updatedProfile)
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

// Enhanced profile completeness calculation with Phase 2.1 framework
function calculateEnhancedProfileCompleteness(personalityData) {
  const phases = {
    // Phase 1: Basic personality (20% weight)
    basic: ['interests', 'communication_patterns', 'emotional_patterns'],
    
    // Phase 2.1: Conversation flow insights (25% weight)  
    conversation_flow: ['conversation_flow'],
    
    // Phase 2.2: MBTI framework (20% weight)
    mbti: ['mbti_indicators'],
    
    // Phase 2.3: Advanced psychology (25% weight)
    advanced_psychology: ['love_language_hints', 'attachment_hints'],
    
    // Phase 2.4: Values and lifestyle (10% weight)
    values: ['family_values_hints']
  };
  
  const weights = {
    basic: 0.20,
    conversation_flow: 0.25,
    mbti: 0.20,
    advanced_psychology: 0.25,
    values: 0.10
  };
  
  let totalScore = 0;
  
  Object.entries(phases).forEach(([phase, fields]) => {
    const phaseFields = fields.filter(field => {
      const data = personalityData[field];
      if (Array.isArray(data)) return data.length > 0;
      if (typeof data === 'object') return Object.keys(data || {}).length > 0;
      return !!data;
    });
    
    const phaseCompleteness = phaseFields.length / fields.length;
    totalScore += phaseCompleteness * weights[phase];
  });
  
  return Math.round(totalScore * 100);
}

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

// Enhanced health check with Phase 2.1 capabilities
app.get('/api/health', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT NOW()');
    const allowlistCount = await pool.query('SELECT COUNT(*) FROM phone_allowlist WHERE status = $1', ['active']);
    
    res.json({ 
      status: 'SoulSync AI Backend - PHASE 2.1 COMPLETE: Natural Conversation Flow Engine ✅',
      database_connected: true,
      database_time: dbTest.rows[0].now,
      allowlist_users: allowlistCount.rows[0].count,
      allowlist_capacity: '35 users max',
      phase_status: {
        'Phase 1': '✅ Complete - Phone verification, memory, basic personality',
        'Phase 2.1': '✅ Complete - Natural Conversation Flow Engine + Psychology Framework',
        'Phase 2.2': '🔄 Ready - MBTI Detection (framework in place)',
        'Phase 2.3': '🔄 Ready - Advanced Love Language & Attachment (framework in place)', 
        'Phase 2.4': '🔄 Ready - Values & Lifestyle Profiling (framework in place)'
      },
      features: [
        'PostgreSQL Memory System ✅',
        'Phone Number Allowlist (35 users) ✅',
        'Complete User Profiles ✅',
        'Cross-session Continuity ✅',
        'Adaptive personality system ✅',
        'Real-time mood detection ✅',
        'Interest tracking ✅',
        
        // NEW Phase 2.1 Features
        'Natural Conversation Flow Engine ✅',
        'Progressive intimacy levels (0-4) ✅',
        'Story-based question generation ✅',
        'Interactive conversation elements ✅',
        'Emotional openness tracking ✅',
        'Celebration moment detection ✅',
        'Enhanced love language detection ✅',
        'Advanced attachment style analysis ✅',
        'MBTI indicators framework ✅',
        'Scenario-based psychology detection ✅',
        
        'Admin management system ✅',
        'Database schema fix endpoint ✅'
      ],
      conversation_capabilities: {
        intimacy_levels: 5,
        story_templates: 25,
        interactive_elements: 12,
        psychology_frameworks: 4,
        mood_adaptations: 'Dynamic',
        conversation_flow: 'Human-centered'
      }
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
  console.log(`🧠 SoulSync AI Backend - PHASE 2.1 COMPLETE: Natural Conversation Flow Engine`);
  console.log('✅ PHASE 1: Phone verification, memory, basic personality detection');
  console.log('✅ PHASE 2.1: Natural conversation flow + comprehensive psychology framework');
  console.log('🎯 Features: Progressive intimacy, story-based questions, interactive elements');
  console.log('🔄 Ready for Phase 2.2: MBTI Detection | Phase 2.3: Advanced Psychology | Phase 2.4: Values');
  console.log(`🚀 Running on port ${PORT} - Conversation feels human, warm, and engaging!`);
});
