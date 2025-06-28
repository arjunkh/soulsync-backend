// SoulSync AI Backend - COMPLETE IMPLEMENTATION with PRD Vision
// Flirtatious AI Companion + Couple Compass + Report Generation + Matchmaking
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
        couple_compass_data JSONB DEFAULT '{}',
        report_generated BOOLEAN DEFAULT FALSE,
        total_conversations INTEGER DEFAULT 0,
        profile_completeness INTEGER DEFAULT 0
      )
    `);

    // Add personal memories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_memories (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(user_id) ON DELETE CASCADE,
        memory TEXT NOT NULL,
        context TEXT,
        category VARCHAR(50),
        confidence DECIMAL(3,2) DEFAULT 0.85,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_referenced TIMESTAMP,
        reference_count INTEGER DEFAULT 0
      )
    `);

    // Add index for faster queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_memories_user_id 
      ON user_memories(user_id)
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

    // Personal Reports table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS personal_reports (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(user_id),
        report_type VARCHAR(50),
        report_content JSONB,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Matches table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        user1_id VARCHAR(255) REFERENCES users(user_id),
        user2_id VARCHAR(255) REFERENCES users(user_id),
        compatibility_score DECIMAL(3,2),
        match_reasons JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending'
      )
    `);

    // User Insight Map for goal tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_insight_map (
        user_id VARCHAR(255) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
        -- Primary matchmaking insights
        love_language JSONB DEFAULT '{"value": null, "confidence": 0, "evidence": []}',
        attachment_style JSONB DEFAULT '{"value": null, "confidence": 0, "evidence": []}',
        conflict_style JSONB DEFAULT '{"value": null, "confidence": 0, "evidence": []}',
        lifestyle_preferences JSONB DEFAULT '{"value": null, "confidence": 0, "evidence": []}',
        values_alignment JSONB DEFAULT '{"value": null, "confidence": 0, "evidence": []}',
        emotional_needs JSONB DEFAULT '{"value": null, "confidence": 0, "evidence": []}',
        -- Metadata
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completion_percentage INTEGER DEFAULT 0,
        ready_for_matching BOOLEAN DEFAULT FALSE
      )
    `);

    // Add age and additional demographic columns
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS age INTEGER CHECK (age >= 18 AND age <= 100)
    `);

    // While we're at it, add other demographic columns for future use
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS income_range VARCHAR(50),
      ADD COLUMN IF NOT EXISTS birth_date DATE,
      ADD COLUMN IF NOT EXISTS birth_time TIME,
      ADD COLUMN IF NOT EXISTS birth_place VARCHAR(200)
    `);

    console.log('✅ Added demographic columns (age, income_range, birth details)');

    // Add initial admin numbers
    await pool.query(`
      INSERT INTO phone_allowlist (phone_number, user_name, user_gender, added_by, notes, status)
      VALUES
        ('+919876543210', 'Admin User', 'Male', 'system', 'App creator - primary admin', 'active'),
        ('+911234567890', 'Test User', 'Female', 'system', 'Test number for development', 'active')
      ON CONFLICT (phone_number) DO NOTHING
    `);

    // Life Stage Feature - Database Setup
    console.log('🔄 Setting up Life Stage columns...');

    // Add life_stage column
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN life_stage VARCHAR(20)
      `);
      console.log('✅ Created life_stage column');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('✅ life_stage column already exists');
      } else {
        console.error('❌ Error adding life_stage column:', err.message);
      }
    }

    // Add life_stage_flexibility column
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN life_stage_flexibility VARCHAR(20) DEFAULT 'adjacent'
      `);
      console.log('✅ Created life_stage_flexibility column');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('✅ life_stage_flexibility column already exists');
      } else {
        console.error('❌ Error adding life_stage_flexibility column:', err.message);
      }
    }

    // Create index for better performance
    try {
      await pool.query(`
        CREATE INDEX idx_users_life_stage ON users(life_stage)
      `);
      console.log('✅ Created life_stage index');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('✅ life_stage index already exists');
      } else {
        console.error('❌ Error creating index:', err.message);
      }
    }

    // Auto-populate life stages for existing users
    try {
      const updateResult = await pool.query(`
        UPDATE users 
        SET life_stage = 
          CASE 
            WHEN age >= 20 AND age <= 27 THEN 'early_career'
            WHEN age >= 28 AND age <= 35 THEN 'establishing'
            WHEN age >= 36 AND age <= 45 THEN 'established'
            WHEN age > 45 THEN 'mature'
            ELSE life_stage
          END
        WHERE age IS NOT NULL AND life_stage IS NULL
      `);
      console.log(`✅ Updated ${updateResult.rowCount} existing users with life stages`);
    } catch (err) {
      console.error('❌ Error updating existing users:', err.message);
    }

    console.log('✅ Database tables initialized successfully with complete schema');
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
async function getOrCreateUserWithPhone(phoneNumber, userName, userGender, userAge) {
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
      // Calculate life stage for new user
      const lifeStage = LifeStageManager.getLifeStage(userAge);

      // Create new user with complete profile including life stage
      result = await pool.query(
        `INSERT INTO users (user_id, phone_number, user_name, user_gender, age, life_stage, personality_data, relationship_context, couple_compass_data, total_conversations)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [
          userId,
          normalizedPhone,
          userName,
          userGender,
          userAge,
          lifeStage,
          { name: userName, gender: userGender, age: userAge },
          { current_depth: 'new', topics_covered: [], comfort_level: 'getting_acquainted', intimacy_level: 0 },
          {},
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
          user_gender = COALESCE($3, user_gender),
          age = COALESCE($4, age),
          life_stage = COALESCE($5, life_stage)
        WHERE phone_number = $1`,
        [normalizedPhone, userName, userGender, userAge, LifeStageManager.getLifeStage(userAge)]
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
    
    const { phoneNumber, userName, userGender, userAge } = req.body;
    
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

    if (!userAge || userAge < 18) {
      console.log('❌ Missing or invalid user age');
      return res.status(400).json({ 
        success: false, 
        message: 'Age is required (must be 18 or above)' 
      });
    }
    
    console.log(`📱 Verifying: ${userName} (${userGender}) - ${phoneNumber}`);
    
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const allowlistEntry = await isPhoneAllowed(normalizedPhone);
    
    if (allowlistEntry) {
      console.log('✅ Phone verification successful');
      
      // Create or get user with complete profile
      const user = await getOrCreateUserWithPhone(normalizedPhone, userName.trim(), userGender, userAge);
      
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
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completeness INTEGER DEFAULT 0',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS couple_compass_data JSONB DEFAULT \'{}\'',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS report_generated BOOLEAN DEFAULT FALSE'
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

// PHASE 1: Aria's Professional Matchmaker Personality
class AriaPersonalShares {
  constructor() {
    this.greetings = [
      "Hi there! 💕\nI've been thinking about what makes relationships truly work...",
      "Hello again! 🌟\nI was just reading about attachment styles. Fascinating stuff...",
      "Welcome back! 😊\nYou know what I've noticed about lasting connections?"
    ];

    this.professionalInsights = {
      work_stress: [
        "Work stress really tests what we need from a partner. Some need a cheerleader, others need a calm presence.",
        "That kind of pressure reveals a lot about what support means to you."
      ],
      relationships: [
        "Every relationship teaches us something about what we truly need.",
        "It's interesting how our past relationships shape what we look for next."
      ],
      weekend: [
        "How someone spends their free time says so much about their relationship style.",
        "Weekend preferences often predict compatibility - some need adventure, others need rest."
      ],
      food: [
        "Sharing meals is such a fundamental way people connect.",
        "Food preferences can actually indicate love languages - acts of service, quality time..."
      ]
    };

    this.observations = [
      "What you're sharing tells me you value [trait] in relationships...",
      "I'm noticing you might need someone who [observation]...",
      "This makes me think you'd connect well with someone who [quality]...",
      "Your story suggests you're looking for [need]..."
    ];

    this.professionalResponses = {
      understanding: [
        "That tells me a lot about what you need.",
        "I'm getting a clearer picture of your ideal match.",
        "This is really helpful for understanding your relationship style.",
        "Now I understand better what would make you feel loved."
      ],
      validation: [
        "That's a really healthy perspective on relationships.",
        "Your self-awareness about this is impressive.",
        "Many people don't realize this about themselves.",
        "This kind of clarity is rare and valuable."
      ],
      exploration: [
        "Let's explore that a bit more...",
        "I'm curious what that means for you in relationships...",
        "How do you think that shapes what you're looking for?",
        "That's interesting - tell me more about that."
      ]
    };
  }

  getGreeting(isNewUser, userName) {
    if (isNewUser) {
      return `Hey! I'm Aria, your personal matchmaker 💕\n\nBefore I find someone who truly gets you, I want to get to know you — what makes your heart beat a little faster, what matters most in a relationship, and what kind of love you're looking for.\n\nLet's talk. I'm all ears, and your story is where the magic begins ✨`;
    }
    return this.greetings[Math.floor(Math.random() * this.greetings.length)];
  }

  getProfessionalInsight(topic) {
    const topicKey = Object.keys(this.professionalInsights).find(key => topic.toLowerCase().includes(key));
    if (topicKey) {
      const insights = this.professionalInsights[topicKey];
      return insights[Math.floor(Math.random() * insights.length)];
    }
    return null;
  }

  getObservation(userInsight) {
    const observation = this.observations[Math.floor(Math.random() * this.observations.length)];
    return observation
      .replace('[trait]', userInsight.trait || 'authenticity')
      .replace('[observation]', userInsight.observation || 'understands you deeply')
      .replace('[quality]', userInsight.quality || 'shares your values')
      .replace('[need]', userInsight.need || 'a genuine connection');
  }

  getProfessionalResponse(type) {
    const responses = this.professionalResponses[type] || this.professionalResponses.understanding;
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Professional bridge templates
  getBridgeResponse(scenario, userInput) {
    const bridges = {
      work: "That sounds challenging. Would you want someone who supports that grind — or helps you find balance?",
      food: "Cooking says a lot about how we show love. Would you say that's one of your love languages?",
      travel: "Do you need a partner who matches your adventurous spirit or someone who grounds you?",
      stress: "When life gets overwhelming like that, what kind of support helps you most?",
      family: "Family dynamics really shape what we need in relationships. How important is that compatibility to you?",
      hobby: "Having separate interests can be healthy. Do you prefer a partner who shares your hobbies or brings new ones?"
    };

    const relevantBridge = Object.keys(bridges).find(key => userInput.toLowerCase().includes(key));
    return relevantBridge ? bridges[relevantBridge] : null;
  }
}

// Professional Bridge Generator - Natural Conversation Transitions
class BridgeGenerator {
  constructor() {
    // Good bridge patterns from document
    this.bridgeTemplates = {
      work_stress: {
        keywords: ['work', 'job', 'stress', 'busy', 'career', 'office'],
        bridges: [
          "That sounds {intensity}. Would you want someone who supports that grind — or helps you find balance?",
          "Work-life balance is so personal. Do you need a partner who matches your ambition or complements it?",
          "{acknowledgment}. In a relationship, would you want someone in a similar field or completely different?"
        ]
      },
      food_cooking: {
        keywords: ['cook', 'food', 'eat', 'restaurant', 'meal', 'dinner'],
        bridges: [
          "Cooking says a lot about how we show love. Would you say that's one of your love languages?",
          "{acknowledgment}. Do you see sharing meals as quality time or more of a daily routine?",
          "Food brings people together. Are you looking for someone who shares your culinary interests?"
        ]
      },
      travel_movement: {
        keywords: ['travel', 'move', 'city', 'adventure', 'explore', 'trip'],
        bridges: [
          "Do you need a partner who matches your wanderlust or someone who grounds you?",
          "{acknowledgment}. Would your ideal partner share your adventurous spirit or balance it with stability?",
          "That restless energy - is it something you'd want mirrored or balanced in a relationship?"
        ]
      },
      family: {
        keywords: ['family', 'parents', 'siblings', 'home', 'childhood'],
        bridges: [
          "Family shapes so much about how we love. How important is family compatibility to you?",
          "{acknowledgment}. Do you see yourself with someone who has similar family values?",
          "Those family dynamics - they really influence what we need in partnerships, don't they?"
        ]
      },
      emotional_growth: {
        keywords: ['therapy', 'growth', 'healing', 'mental health', 'self-care'],
        bridges: [
          "That's really brave. Do you value that kind of emotional awareness in a partner too?",
          "{acknowledgment}. Would you want someone on a similar growth journey?",
          "Self-awareness like that is rare. Is emotional intelligence a must-have for you?"
        ]
      },
      lifestyle: {
        keywords: ['weekend', 'free time', 'hobbies', 'routine', 'morning', 'night'],
        bridges: [
          "Are you more of a homebody in love too — or need someone who pulls you out?",
          "{acknowledgment}. Do you want a partner who shares your rhythm or adds variety?",
          "Lifestyle compatibility matters. Would you want someone with a similar routine?"
        ]
      },
      disinterest: {
        keywords: ['how are you', 'whats up', 'hey', 'random', 'whatever'],
        bridges: [
          "Sweet of you to ask — but I'd be a bad matchmaker if I didn't ask: what kind of connection are you hoping to find?",
          "I appreciate that! Now, let me do my job — what would make a relationship feel right to you?",
          "That's kind! Back to you though — what matters most in your ideal partnership?"
        ]
      }
    };

    // Acknowledgment templates
    this.acknowledgments = {
      positive: ["That sounds wonderful", "I love that", "That's beautiful"],
      challenging: ["That sounds tough", "That must be challenging", "I hear you"],
      neutral: ["That's interesting", "I see", "That makes sense"]
    };

    // Intensity modifiers
    this.intensities = {
      high: ["really challenging", "intense", "overwhelming"],
      medium: ["demanding", "busy", "full"],
      low: ["manageable", "steady", "routine"]
    };
  }

  generateBridge(userMessage, targetGoal = null) {
    const message = userMessage.toLowerCase();

    // Find matching bridge category
    let selectedCategory = null;
    let highestMatch = 0;

    for (const [category, data] of Object.entries(this.bridgeTemplates)) {
      const matchCount = data.keywords.filter(keyword => message.includes(keyword)).length;
      if (matchCount > highestMatch) {
        highestMatch = matchCount;
        selectedCategory = category;
      }
    }

    if (!selectedCategory) {
      return this.getDefaultBridge(targetGoal);
    }

    // Select a bridge template
    const bridges = this.bridgeTemplates[selectedCategory].bridges;
    let bridge = bridges[Math.floor(Math.random() * bridges.length)];

    // Replace placeholders
    bridge = this.replacePlaceholders(bridge, userMessage);

    return bridge;
  }

  replacePlaceholders(bridge, userMessage) {
    // Determine sentiment
    const sentiment = this.analyzeSentiment(userMessage);

    // Replace {acknowledgment}
    const acknowledgment = this.acknowledgments[sentiment][
      Math.floor(Math.random() * this.acknowledgments[sentiment].length)
    ];
    bridge = bridge.replace('{acknowledgment}', acknowledgment);

    // Replace {intensity}
    const intensity = this.intensities.medium[
      Math.floor(Math.random() * this.intensities.medium.length)
    ];
    bridge = bridge.replace('{intensity}', intensity);

    return bridge;
  }

  analyzeSentiment(message) {
    const positive = ['love', 'great', 'amazing', 'happy', 'excited', 'wonderful'];
    const negative = ['stress', 'hard', 'difficult', 'tired', 'frustrated', 'angry'];

    const posCount = positive.filter(word => message.includes(word)).length;
    const negCount = negative.filter(word => message.includes(word)).length;

    if (posCount > negCount) return 'positive';
    if (negCount > posCount) return 'challenging';
    return 'neutral';
  }

  getDefaultBridge(targetGoal) {
    const defaults = {
      attachment: "How do you typically feel most secure in relationships?",
      love_language: "What makes you feel most appreciated by someone close to you?",
      values: "What values are non-negotiable for you in a partnership?",
      lifestyle: "What does your ideal shared life look like day-to-day?",
      emotional_needs: "What kind of emotional support helps you thrive?"
    };

    return defaults[targetGoal] || "Tell me more about what you're looking for in a relationship.";
  }

  // Check if a bridge would be appropriate
  shouldBridge(messageCount, lastBridgeCount, currentTopic, userEngagement) {
    // Don't bridge too often
    if (messageCount - lastBridgeCount < 3) return false;

    // Don't bridge if user is highly engaged in current topic
    if (userEngagement === 'high' && currentTopic === 'relationships') return false;

    // Do bridge if conversation is drifting
    if (currentTopic === 'off_topic' || userEngagement === 'low') return true;

    // Natural bridging every 4-5 messages
    return messageCount - lastBridgeCount >= 4;
  }

  shouldUseBridge(userMessage, lastBridgeCount, messageCount) {
    // Don't bridge if user is sharing deep relationship insights
    const deepSharing = [
      'partnership',
      'support',
      'love',
      'relationship',
      'together',
      'caring',
      'mutual',
      'understanding'
    ];

    const isRelationshipFocused = deepSharing.some(word =>
      userMessage.toLowerCase().includes(word)
    );

    if (isRelationshipFocused) return false;

    // If talking about non-relationship topics, bridge after 2-3 messages
    return messageCount - lastBridgeCount >= 2;
  }
}

// Goal-Oriented Matchmaking Planner
class MatchmakerPlanner {
  constructor() {
    // Define all matchmaking data points needed
    this.dataGoals = {
      // Primary goals (must have)
      attachment_style: {
        priority: 1,
        category: 'emotional',
        description: 'How they form and maintain emotional bonds',
        questions: [
          "What makes you feel most secure in a relationship?",
          "How do you typically express affection?",
          "What does emotional support look like to you?"
        ],
        keywords: ['secure', 'anxious', 'avoidant', 'independent', 'clingy', 'space']
      },

      love_language: {
        priority: 1,
        category: 'emotional',
        description: 'How they give and receive love',
        questions: [
          "What makes you feel most appreciated by someone close to you?",
          "How do you naturally show someone you care?",
          "What small gestures mean the most to you?"
        ],
        keywords: ['quality time', 'touch', 'words', 'acts', 'gifts', 'appreciation']
      },

      conflict_style: {
        priority: 2,
        category: 'communication',
        description: 'How they handle disagreements',
        questions: [
          "When you disagree with someone close, what's your instinct?",
          "How do you prefer to resolve tensions?",
          "What helps you feel heard during difficult conversations?"
        ],
        keywords: ['talk', 'space', 'avoid', 'process', 'immediate', 'calm']
      },

      lifestyle_preferences: {
        priority: 2,
        category: 'lifestyle',
        description: 'Daily life and routine preferences',
        questions: [
          "What does your ideal weekend look like?",
          "How do you recharge after a long week?",
          "What's your ideal balance of together vs. alone time?"
        ],
        keywords: ['homebody', 'adventurous', 'routine', 'spontaneous', 'social', 'quiet']
      },

      values_alignment: {
        priority: 3,
        category: 'values',
        description: 'Core values and beliefs',
        questions: [
          "What values are non-negotiable for you in a partnership?",
          "What does a meaningful life look like to you?",
          "What principles guide your major decisions?"
        ],
        keywords: ['family', 'career', 'growth', 'stability', 'adventure', 'tradition']
      },

      emotional_needs: {
        priority: 3,
        category: 'emotional',
        description: 'What they need to feel fulfilled',
        questions: [
          "What do you need from a partner when you're struggling?",
          "What makes you feel truly understood?",
          "What kind of emotional environment helps you thrive?"
        ],
        keywords: ['support', 'understanding', 'space', 'validation', 'encouragement', 'presence']
      }
    };

    // Track conversation state
    this.conversationState = {
      currentGoal: null,
      attemptedGoals: new Set(),
      completedGoals: new Set(),
      resistanceEncountered: new Map(),
      lastGoalSwitch: 0
    };
  }

  // Analyze what we already know about the user
  analyzeUserProgress(userInsightMap) {
    const progress = {
      completed: [],
      partial: [],
      missing: [],
      completionPercentage: 0
    };

    let totalPoints = 0;
    let completedPoints = 0;

    Object.entries(this.dataGoals).forEach(([goal, config]) => {
      totalPoints += config.priority;

      if (userInsightMap[goal] && userInsightMap[goal].confidence > 0.7) {
        progress.completed.push(goal);
        completedPoints += config.priority;
      } else if (userInsightMap[goal] && userInsightMap[goal].confidence > 0.3) {
        progress.partial.push(goal);
        completedPoints += config.priority * 0.5;
      } else {
        progress.missing.push(goal);
      }
    });

    progress.completionPercentage = Math.round((completedPoints / totalPoints) * 100);
    return progress;
  }

  // Select next conversation goal
  selectNextGoal(userProgress, conversationContext, messageCount) {
    // Don't switch goals too frequently
    if (this.conversationState.currentGoal &&
        messageCount - this.conversationState.lastGoalSwitch < 3) {
      return this.conversationState.currentGoal;
    }

    // Priority: missing high-priority goals first
    const missingHighPriority = userProgress.missing
      .filter(goal => this.dataGoals[goal].priority === 1)
      .filter(goal => !this.conversationState.attemptedGoals.has(goal));

    if (missingHighPriority.length > 0) {
      const selected = missingHighPriority[0];
      this.updateGoalState(selected, messageCount);
      return selected;
    }

    // Then partial data that needs reinforcement
    const partialGoals = userProgress.partial
      .filter(goal => !this.hasHighResistance(goal));

    if (partialGoals.length > 0) {
      const selected = partialGoals[0];
      this.updateGoalState(selected, messageCount);
      return selected;
    }

    // Finally, lower priority missing goals
    const remainingGoals = userProgress.missing
      .filter(goal => !this.conversationState.attemptedGoals.has(goal));

    if (remainingGoals.length > 0) {
      const selected = remainingGoals[0];
      this.updateGoalState(selected, messageCount);
      return selected;
    }

    // All goals attempted - retry with lower resistance threshold
    this.conversationState.attemptedGoals.clear();
    return this.selectNextGoal(userProgress, conversationContext, messageCount);
  }

  updateGoalState(goal, messageCount) {
    this.conversationState.currentGoal = goal;
    this.conversationState.lastGoalSwitch = messageCount;
    this.conversationState.attemptedGoals.add(goal);
  }

  hasHighResistance(goal) {
    const resistance = this.conversationState.resistanceEncountered.get(goal) || 0;
    return resistance >= 2;
  }

  // Generate natural question for goal
  generateGoalQuestion(goal, conversationContext) {
    const config = this.dataGoals[goal];
    if (!config) return null;

    // Select question based on context
    const questions = config.questions;
    const contextualQuestion = this.selectContextualQuestion(questions, conversationContext);

    return {
      question: contextualQuestion,
      category: config.category,
      goal: goal
    };
  }

  selectContextualQuestion(questions, context) {
    // Simple selection for now - can be enhanced with context matching
    return questions[Math.floor(Math.random() * questions.length)];
  }

  // Generate bridge to goal
  generateGoalBridge(currentTopic, targetGoal, userMessage) {
    const transitions = {
      work_to_attachment: "Work stress really shows what we need from our close relationships. ${question}",
      food_to_love_language: "The way you talk about food... I'm curious - ${question}",
      weekend_to_lifestyle: "Your weekend sounds lovely. ${question}",
      general_to_values: "That's interesting. You know what I'm realizing? ${question}",
      stress_to_emotional: "When life gets overwhelming like that, ${question}"
    };

    // Find matching transition
    const transitionKey = `${currentTopic}_to_${this.dataGoals[targetGoal]?.category}`;
    let template = transitions[transitionKey] || transitions.general_to_values;

    // Insert question
    const goalQuestion = this.generateGoalQuestion(targetGoal, userMessage);
    return template.replace('${question}', goalQuestion.question);
  }

  // Record resistance
  recordResistance(goal) {
    const currentResistance = this.conversationState.resistanceEncountered.get(goal) || 0;
    this.conversationState.resistanceEncountered.set(goal, currentResistance + 1);
  }

  // Get conversation guidance
  getConversationGuidance(userProgress, currentTopic, resistanceDetected) {
    const guidance = {
      strategy: 'explore',
      goal: this.conversationState.currentGoal,
      approach: 'natural',
      specificGuidance: ''
    };

    if (resistanceDetected && this.conversationState.currentGoal) {
      this.recordResistance(this.conversationState.currentGoal);
      guidance.strategy = 'build_trust';
      guidance.approach = 'indirect';
      guidance.specificGuidance = 'User seems guarded. Build rapport before returning to this topic.';
    } else if (userProgress.completionPercentage > 80) {
      guidance.strategy = 'deepen';
      guidance.approach = 'reflective';
      guidance.specificGuidance = 'We have good coverage. Focus on deepening understanding.';
    } else if (userProgress.missing.length > 3) {
      guidance.strategy = 'focused_collection';
      guidance.approach = 'gentle_persistence';
      guidance.specificGuidance = `Still need: ${userProgress.missing.join(', ')}. Stay warm but purposeful.`;
    }

    return guidance;
  }

  // Check if ready for Couple Compass
  shouldInitiateCoupleCompass(userProgress, conversationCount, userEngagement) {
    // Need at least 60% data before Couple Compass
    if (userProgress.completionPercentage < 60) return false;

    // Or high engagement after 8+ messages
    if (conversationCount >= 8 && userEngagement === 'high') return true;

    // Or most primary goals complete
    const primaryComplete = userProgress.completed.filter(goal =>
      this.dataGoals[goal].priority === 1
    ).length;

    return primaryComplete >= 2;
  }
}

// PHASE 2: Couple Compass Game Implementation
class CoupleCompass {
  constructor() {
    this.questions = [
      {
        id: 'living_arrangement',
        text: "Where do you envision making a home after marriage?",
        conversational: "Let's start with lifestyle preferences. After marriage, where do you see yourself making a home? This helps me understand what kind of living situation would make you happiest.",
        options: [
          { value: 'with_parents', text: 'With family' },
          { value: 'near_parents', text: 'Near family, but independent' },
          { value: 'new_city', text: 'Start fresh in a new location' },
          { value: 'flexible', text: 'Open to any location' }
        ],
        responses: {
          'with_parents': "Family is clearly central to your vision of partnership. This closeness often creates strong support systems and deep roots.",
          'near_parents': "You value both family connections and independence. This balance shows emotional maturity and clear boundaries.",
          'new_city': "You're drawn to fresh starts and new adventures. You'll thrive with a partner who shares your pioneering spirit.",
          'flexible': "Your adaptability is a real strength. You prioritize the relationship over location, which opens many possibilities."
        }
      },
      {
        id: 'financial_style',
        text: "How do you envision handling finances in a committed partnership?",
        conversational: "Financial compatibility matters more than people realize. How do you see yourself handling money matters in a committed relationship?",
        options: [
          { value: 'provider', text: 'Primary provider' },
          { value: 'lead_share', text: 'Main earner, shared responsibilities' },
          { value: 'equal', text: 'Equal financial partnership' },
          { value: 'emotional', text: 'Focus on non-financial contributions' }
        ],
        responses: {
          'provider': "You see providing as a way to care for your partner. This traditional approach works beautifully with the right match.",
          'lead_share': "You're comfortable leading financially while valuing partnership. This balanced approach shows both strength and collaboration.",
          'equal': "Equal partnership is your ideal. You see relationships as true collaborations where both contribute equally.",
          'emotional': "You recognize that contribution isn't just financial. Your emotional intelligence and other gifts are equally valuable."
        }
      },
      {
        id: 'children_vision',
        text: "What are your thoughts on having children?",
        conversational: "This is often a key compatibility factor. Where do you currently stand on having children? It's okay if you're still figuring this out.",
        options: [
          { value: 'yes_involved', text: 'Yes, want to be actively involved' },
          { value: 'yes_support', text: 'Yes, with shared parenting' },
          { value: 'maybe', text: 'Still undecided' },
          { value: 'no', text: 'Prefer not to have children' }
        ],
        responses: {
          'yes_involved': "You're ready to be a hands-on parent. This dedication to family life will be central to your partnership.",
          'yes_support': "You want children with balanced parenting responsibilities. This practical approach sets healthy expectations.",
          'maybe': "You're thoughtfully considering this major decision. This openness allows you to find someone to explore the question with.",
          'no': "You're clear about preferring a child-free life. This self-knowledge helps find someone who shares your vision."
        }
      },
      {
        id: 'conflict_style',
        text: "How do you typically handle disagreements in close relationships?",
        conversational: "Every relationship faces disagreements. Understanding how you naturally handle conflict helps me find someone compatible with your communication style.",
        options: [
          { value: 'talk_out', text: 'Address immediately through discussion' },
          { value: 'need_space', text: 'Need space before discussing' },
          { value: 'mediator', text: 'Benefit from outside perspective' },
          { value: 'avoid', text: 'Tend to avoid confrontation' }
        ],
        responses: {
          'talk_out': "Direct communication is your strength. You believe in addressing issues promptly, which prevents resentment from building.",
          'need_space': "You're self-aware enough to know you need processing time. This emotional intelligence leads to more productive conversations.",
          'mediator': "You value outside perspective in tough moments. This humility and wisdom can really strengthen a relationship.",
          'avoid': "Confrontation is challenging for you. The right partner will create a safe space for gentle, patient communication."
        }
      },
      {
        id: 'ambition_balance',
        text: "What's your ideal balance between career and personal life?",
        conversational: "People have different visions of success and fulfillment. What does your ideal life balance look like?",
        options: [
          { value: 'high_ambition', text: 'Career-focused, ambitious goals' },
          { value: 'balanced', text: 'Success with work-life balance' },
          { value: 'family_first', text: 'Family and relationships first' },
          { value: 'simple_life', text: 'Simple, peaceful lifestyle' }
        ],
        responses: {
          'high_ambition': "Your drive and ambition are impressive. You'll thrive with a partner who either shares or genuinely supports your goals.",
          'balanced': "You've found the sweet spot between ambition and life. This balanced approach attracts similarly grounded partners.",
          'family_first': "Relationships are your priority. This clarity about what matters most will guide you to like-minded partners.",
          'simple_life': "You value peace over ambition. This contentment with simplicity is attractive to those seeking authentic connection."
        }
      },
      {
        id: 'big_mismatch',
        text: "How would you handle major lifestyle differences with a partner?",
        conversational: "Here's a scenario: You connect deeply with someone, but they earn more, want to delay children, and prefer living far from family. How would you approach these differences?",
        options: [
          { value: 'discuss', text: 'Openly discuss and seek compromise' },
          { value: 'unsure', text: 'Would need time to consider' },
          { value: 'mismatch', text: 'Might be incompatible' },
          { value: 'flexible', text: 'Willing to adapt for the right person' }
        ],
        responses: {
          'discuss': "Your commitment to communication and compromise is admirable. This approach builds strong, lasting partnerships.",
          'unsure': "You're honest about needing time to process big differences. This thoughtfulness prevents hasty decisions.",
          'mismatch': "You know your non-negotiables. This clarity helps you find someone whose vision naturally aligns with yours.",
          'flexible': "Your adaptability in love is touching. Just ensure any compromises feel authentic to who you are."
        }
      }
    ];

    this.currentQuestionIndex = 0;
    this.responses = {};

    // Verify we have exactly 6 questions
    if (this.questions.length !== 6) {
      console.error(`❌ CoupleCompass should have 6 questions but has ${this.questions.length}`);
    }

    // Log question IDs for verification
    console.log('✅ CoupleCompass questions loaded:', 
      this.questions.map(q => q.id).join(', '));
  }

  introduce() {
    return {
      text: `I'd like to try something called the Couple Compass with you.

It's a brief assessment that helps me understand your relationship values and life vision. Your responses will be invaluable in identifying truly compatible matches.

The questions cover lifestyle preferences, values, and how you approach partnership. There are no right or wrong answers - just what feels authentic to you.

Ready to explore what matters most to you in a relationship?`,
      buttonText: "Yes, let's begin",
      altResponse: "That's perfectly fine. We can explore this whenever you feel ready. For now, let's continue getting to know each other."
    };
  }

  getCurrentQuestion() {
    if (this.currentQuestionIndex >= this.questions.length) {
      return null;
    }
    return this.questions[this.currentQuestionIndex];
  }

  processAnswer(questionId, answerValue, userName) {
    const question = this.questions.find(q => q.id === questionId);
    if (!question) return null;

    // Store the answer
    this.responses[questionId] = answerValue;
    
    // Get Aria's response
    const ariaResponse = question.responses[answerValue];
    
    // Move to next question
    this.currentQuestionIndex++;

    // Check if complete
    if (this.currentQuestionIndex >= this.questions.length) {
      return {
        response: ariaResponse,
        complete: true,
        synthesis: this.generateSynthesis(userName)
      };
    }

    return {
      response: ariaResponse,
      complete: false,
      nextQuestion: this.getCurrentQuestion()
    };
  }

  generateSynthesis(userName) {
    const living = this.responses.living_arrangement;
    const financial = this.responses.financial_style;
    const children = this.responses.children_vision;
    const conflict = this.responses.conflict_style;
    const ambition = this.responses.ambition_balance;
    const flexibility = this.responses.big_mismatch;

    return `${userName}, thank you for completing the Couple Compass. Your responses have given me valuable insights into what you're looking for in a partnership.

You're someone who ${this.getValuesSummary(living, financial, ambition)}, and in relationships, you ${this.getRelationshipStyle(conflict, flexibility)}.

What stands out most: ${this.getKeyInsight(this.responses)}

With this understanding, I can now focus on finding matches who truly align with your values and complement your vision for the future. Your authenticity in these responses will make all the difference in finding the right person.`;
  }

  getValuesSummary(living, financial, ambition) {
    const values = [];

    if (living === 'with_parents' || living === 'near_parents') {
      values.push("values family connections");
    }
    if (financial === 'equal') {
      values.push("believes in equal partnership");
    }
    if (ambition === 'balanced') {
      values.push("seeks life balance");
    }

    return values.join(" and ") || "has clear values";
  }

  getRelationshipStyle(conflict, flexibility) {
    if (conflict === 'talk_out' && flexibility === 'discuss') {
      return "approach challenges with open communication";
    }
    if (flexibility === 'flexible') {
      return "show remarkable adaptability";
    }
    return "have a thoughtful approach to partnership";
  }

  getKeyInsight(responses) {
    // Professional insights based on pattern analysis
    if (responses.children_vision === 'yes_involved' && responses.family_first) {
      return "Family is clearly at the center of your life vision.";
    }
    if (responses.conflict_style === 'talk_out' && responses.big_mismatch === 'discuss') {
      return "Your communication skills will be a real relationship strength.";
    }
    if (responses.ambition_balance === 'balanced') {
      return "You've already figured out what many people spend years learning - the importance of balance.";
    }
    return "Your self-awareness about what you need is impressive.";
  }

  reset() {
    this.currentQuestionIndex = 0;
    this.responses = {};
  }
}

// PHASE 3: Report Generation System
class PersonalInsightReport {
  generateReport(userData, personalityData, coupleCompassData) {
    const { user_name, user_gender } = userData;
    const mbtiType = this.deriveMBTIType(personalityData.mbti_confidence_scores || {});
    const loveLanguage = this.getPrimaryLoveLanguage(personalityData.love_language_hints || []);
    const attachment = this.getAttachmentStyle(personalityData.attachment_hints || []);
    
    return {
      title: `${user_name}'s Story`,
      sections: {
        introduction: this.generateIntroduction(user_name, user_gender),
        personalityProfile: this.generatePersonalityProfile(mbtiType, personalityData),
        loveStyle: this.generateLoveStyle(loveLanguage, attachment, personalityData),
        relationshipStrengths: this.generateStrengths(personalityData, coupleCompassData),
        growthAreas: this.generateGrowthAreas(personalityData),
        idealPartner: this.generateIdealPartnerProfile(personalityData, coupleCompassData),
        closing: this.generateClosing(user_name)
      },
      generatedAt: new Date().toISOString()
    };
  }

  generateIntroduction(name, gender) {
    return `Dear ${name},

Over our conversations, I've had the privilege of getting to know the real you - not just what you say, but how you think, feel, and love. This report is my love letter to your beautiful complexity.

You've shared your dreams, your fears, and your vision for love. Here's what I've learned about your extraordinary heart...`;
  }

  generatePersonalityProfile(mbtiType, personalityData) {
    const typeDescriptions = {
      'INTJ': 'strategic and independent, with a rare combination of imagination and reliability',
      'ENFP': 'enthusiastic and creative, bringing warmth and inspiration wherever you go',
      'ISFJ': 'caring and dependable, creating harmony and stability for those you love',
      // Add all 16 types...
    };

    return `**Your Personality Blueprint**

You show up in the world as ${mbtiType.partial_type || 'a unique blend of traits'} - ${typeDescriptions[mbtiType.partial_type] || 'someone with a distinctive way of seeing and being in the world'}.

What makes you special:
- Your ${this.getDominantTrait(personalityData)} nature shapes how you connect
- You process the world through ${this.getProcessingStyle(personalityData)}
- In relationships, you lead with ${this.getRelationshipApproach(personalityData)}`;
  }

  generateLoveStyle(loveLanguage, attachment, personalityData) {
    return `**How You Love & Need to Be Loved**

Your primary love language appears to be ${loveLanguage} - you feel most cherished when someone ${this.getLoveLanguageDescription(loveLanguage)}.

Your attachment style leans ${attachment}, which means ${this.getAttachmentDescription(attachment)}.

What you need in love:
- ${this.getLoveNeeds(personalityData).join('\n- ')}`;
  }

  generateStrengths(personalityData, coupleCompassData) {
    const strengths = [];
    
    if (personalityData.emotional_openness === 'very_open') {
      strengths.push("Emotional courage - you share your truth even when vulnerable");
    }
    
    if (coupleCompassData.conflict_style === 'talk_out') {
      strengths.push("Direct communication - you don't let things fester");
    }
    
    if (personalityData.celebration_moments?.length > 0) {
      strengths.push("Self-awareness - you know yourself deeply");
    }
    
    return `**Your Relationship Superpowers**

${strengths.join('\n\n')}

These aren't just traits - they're the foundation of lasting, meaningful love.`;
  }

  generateGrowthAreas(personalityData) {
    const growth = [];
    
    if (personalityData.resistance_count > 2) {
      growth.push("Opening up: Sometimes you protect your heart a bit too carefully. The right person will make it safe to be fully seen.");
    }
    
    if (personalityData.emotional_openness === 'guarded') {
      growth.push("Vulnerability: Your strength sometimes masks your need for support. Remember - needing someone isn't weakness.");
    }
    
    return `**Your Growth Edges**

We all have areas where love challenges us to grow:

${growth.length > 0 ? growth.join('\n\n') : "Your openness to growth is already evident in how you've shared with me. Keep that curious, willing heart."}`;
  }

  generateIdealPartnerProfile(personalityData, coupleCompassData) {
    return `**Who You Need By Your Side**

Based on everything you've shared, your ideal partner is someone who:

- ${this.getPartnerTraits(personalityData, coupleCompassData).join('\n- ')}

This isn't about finding perfection - it's about finding someone whose imperfections fit beautifully with yours.`;
  }

  generateClosing(name) {
    return `${name}, you are ready for the kind of love that sees you, celebrates you, and grows with you.

Remember: The right person won't complete you - they'll complement the complete person you already are.

With love and belief in your journey,
Aria 💕`;
  }

  // Helper methods
  deriveMBTIType(scores) {
    const type = {
      E_I: scores.E_I >= 50 ? 'E' : 'I',
      S_N: scores.S_N >= 50 ? 'S' : 'N',
      T_F: scores.T_F >= 50 ? 'T' : 'F',
      J_P: scores.J_P >= 50 ? 'J' : 'P'
    };
    
    return {
      partial_type: `${type.E_I}${type.S_N}${type.T_F}${type.J_P}`,
      confidence: Object.values(scores).reduce((a, b) => a + b, 0) / 4
    };
  }

  getPrimaryLoveLanguage(hints) {
    const counts = {};
    hints.forEach(hint => {
      counts[hint] = (counts[hint] || 0) + 1;
    });
    
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'quality time';
  }

  getAttachmentStyle(hints) {
    if (hints.includes('secure_tendency')) return 'secure';
    if (hints.includes('anxious_tendency')) return 'anxious';
    if (hints.includes('avoidant_tendency')) return 'avoidant';
    return 'developing';
  }

  getLoveLanguageDescription(language) {
    const descriptions = {
      'quality_time': 'gives you their full, undivided attention',
      'physical_touch': 'shows affection through thoughtful touch',
      'words_of_affirmation': 'tells you how much you matter',
      'acts_of_service': 'shows love through thoughtful actions',
      'gifts': 'remembers and surprises you with meaningful tokens'
    };
    return descriptions[language] || 'shows up for you consistently';
  }

  getAttachmentDescription(style) {
    const descriptions = {
      'secure': 'you balance independence with intimacy beautifully',
      'anxious': 'you love deeply and sometimes need extra reassurance',
      'avoidant': 'you value your independence while learning to let others in',
      'developing': 'you\'re still discovering your unique attachment pattern'
    };
    return descriptions[style];
  }

  getDominantTrait(data) {
    if (data.mbti_confidence_scores?.E_I > 70) return 'outgoing and energetic';
    if (data.mbti_confidence_scores?.E_I < 30) return 'introspective and thoughtful';
    return 'balanced and adaptable';
  }

  getProcessingStyle(data) {
    if (data.mbti_confidence_scores?.S_N > 70) return 'concrete details and practical reality';
    if (data.mbti_confidence_scores?.S_N < 30) return 'possibilities and big-picture thinking';
    return 'both intuition and practical observation';
  }

  getRelationshipApproach(data) {
    if (data.mbti_confidence_scores?.T_F > 70) return 'logic and fairness';
    if (data.mbti_confidence_scores?.T_F < 30) return 'empathy and emotional connection';
    return 'both head and heart';
  }

  getLoveNeeds(data) {
    const needs = [];
    
    if (data.love_language_hints?.includes('quality_time')) {
      needs.push("Undivided attention and genuine presence");
    }
    
    if (data.attachment_hints?.includes('secure_tendency')) {
      needs.push("A balance of togetherness and independence");
    }
    
    if (data.emotional_patterns?.latest_mood === 'stressed') {
      needs.push("A partner who can be your calm in the storm");
    }
    
    needs.push("Someone who sees your complexity as beautiful, not complicated");
    
    return needs;
  }

  getPartnerTraits(personalityData, coupleCompassData) {
    const traits = [];
    
    // Based on MBTI
    if (personalityData.mbti_confidence_scores?.E_I > 70) {
      traits.push("Matches your social energy or gives you space to shine");
    } else if (personalityData.mbti_confidence_scores?.E_I < 30) {
      traits.push("Respects your need for quiet and reflection");
    }
    
    // Based on Couple Compass
    if (coupleCompassData.living_arrangement === 'near_parents') {
      traits.push("Values family but also needs independence");
    }
    
    if (coupleCompassData.financial_style === 'equal') {
      traits.push("Sees partnership as true collaboration");
    }
    
    if (coupleCompassData.children_vision === 'yes_involved') {
      traits.push("Shares your vision of hands-on parenting");
    }
    
    // Universal needs
    traits.push("Makes you feel safe to be completely yourself");
    traits.push("Challenges you to grow while accepting who you are now");
    
    return traits;
  }
}

// PHASE 4: Basic Compatibility Engine
class CompatibilityEngine {
  constructor() {
    // Dealbreaker definitions
    this.absoluteDealbreakers = [
      {
        name: 'children_opposite',
        check: (c1, c2) => {
          const wantsKids = ['yes_involved', 'yes_support'];
          const noKids = ['no'];
          return (
            (wantsKids.includes(c1.children_vision) && noKids.includes(c2.children_vision)) ||
            (noKids.includes(c1.children_vision) && wantsKids.includes(c2.children_vision))
          );
        },
        message: 'Fundamental disagreement on having children'
      },
      {
        name: 'both_avoid_conflict',
        check: (c1, c2) => c1.conflict_style === 'avoid' && c2.conflict_style === 'avoid',
        message: 'Both avoid conflict - relationship cannot resolve issues'
      },
      {
        name: 'extreme_living',
        check: (c1, c2) => {
          return (
            (c1.living_arrangement === 'with_parents' && c2.living_arrangement === 'new_city') ||
            (c1.living_arrangement === 'new_city' && c2.living_arrangement === 'with_parents')
          );
        },
        message: 'Incompatible lifestyle preferences'
      },
      {
        name: 'life_stage_incompatible',
        check: (c1, c2) => {
          const flexibility1 = LifeStageManager.shouldExpandFlexibility(c1, c2);
          const flexibility2 = LifeStageManager.shouldExpandFlexibility(c2, c1);
          const score = LifeStageManager.calculateLifeStageScore(
            c1.life_stage,
            c2.life_stage,
            flexibility1,
            flexibility2
          );
          return score === 0;
        },
        message: 'Life stages too different for compatibility'
      }
    ];

    this.redFlags = [
      {
        name: 'extreme_ambition_mismatch',
        check: (c1, c2) => {
          return (
            (c1.ambition_balance === 'high_ambition' && c2.ambition_balance === 'simple_life') ||
            (c1.ambition_balance === 'simple_life' && c2.ambition_balance === 'high_ambition')
          );
        },
        maxScore: 20,
        message: 'Major lifestyle and ambition mismatch'
      }
    ];
  }

  // ADD THIS NEW METHOD:
  checkDealbreakers(compass1, compass2) {
    // Check absolute dealbreakers
    for (const dealbreaker of this.absoluteDealbreakers) {
      if (dealbreaker.check(compass1, compass2)) {
        return {
          hasDealbreaker: true,
          score: 0,
          reason: dealbreaker.message,
          type: 'absolute'
        };
      }
    }

    // Check red flags
    for (const flag of this.redFlags) {
      if (flag.check(compass1, compass2)) {
        return {
          hasRedFlag: true,
          maxScore: flag.maxScore,
          reason: flag.message,
          type: 'red'
        };
      }
    }

    return { hasDealbreaker: false, hasRedFlag: false };
  }

  calculateCompatibility(user1Data, user2Data) {
    // Check for dealbreakers first
    const dealbreakCheck = this.checkDealbreakers(
      user1Data.couple_compass || {},
      user2Data.couple_compass || {}
    );

    if (dealbreakCheck.hasDealbreaker) {
      return {
        overallScore: 0,
        dimensionScores: {
          mbti: 0,
          values: 0,
          emotional: 0,
          lifestyle: 0,
          growth: 0
        },
        topReasons: [dealbreakCheck.reason],
        recommendation: 'Not Compatible - ' + dealbreakCheck.reason
      };
    }

    const scores = {
      mbti: this.calculateMBTICompatibility(user1Data.mbti_type, user2Data.mbti_type),
      values: this.calculateValueAlignment(user1Data.couple_compass, user2Data.couple_compass),
      emotional: this.calculateEmotionalFit(
        user1Data.attachment_style,
        user2Data.attachment_style,
        user1Data.love_languages || [],
        user2Data.love_languages || []
      ),
      lifestyle: this.calculateLifestyleMatch(user1Data, user2Data),
      growth: this.calculateGrowthPotential(user1Data, user2Data),
      lifeStage: this.calculateLifeStageCompatibility(user1Data, user2Data)
    };

    const overallScore = this.calculateOverallScore(scores);

    // ADD THIS: Apply red flag cap if needed
    let finalScore = overallScore;
    if (dealbreakCheck.hasRedFlag) {
      finalScore = Math.min(overallScore, dealbreakCheck.maxScore);
    }

    const reasons = this.generateCompatibilityReasons(scores, user1Data, user2Data);

    return {
      overallScore: finalScore,
      dimensionScores: scores,
      topReasons: dealbreakCheck.hasRedFlag ? [dealbreakCheck.reason, ...reasons] : reasons,
      recommendation: this.getRecommendation(finalScore)
    };
  }

  calculateMBTICompatibility(type1, type2) {
    // Simplified MBTI compatibility logic
    const cognitiveCompatibility = {
      'E_E': 0.7, 'E_I': 0.8, 'I_I': 0.7,
      'S_S': 0.8, 'S_N': 0.7, 'N_N': 0.8,
      'T_T': 0.7, 'T_F': 0.8, 'F_F': 0.7,
      'J_J': 0.8, 'J_P': 0.7, 'P_P': 0.6
    };

    let score = 0;
    score += cognitiveCompatibility[`${type1[0]}_${type2[0]}`] || 0.5;
    score += cognitiveCompatibility[`${type1[1]}_${type2[1]}`] || 0.5;
    score += cognitiveCompatibility[`${type1[2]}_${type2[2]}`] || 0.5;
    score += cognitiveCompatibility[`${type1[3]}_${type2[3]}`] || 0.5;

    return (score / 4) * 100;
  }

  calculateValueAlignment(compass1, compass2) {
    let alignmentScore = 0;
    let totalQuestions = 0;

    Object.keys(compass1).forEach(key => {
      if (compass2[key]) {
        totalQuestions++;
        if (compass1[key] === compass2[key]) {
          alignmentScore += 1;
        } else if (this.areValuesCompatible(key, compass1[key], compass2[key])) {
          alignmentScore += 0.7;
        } else {
          alignmentScore += 0.3;
        }
      }
    });

    return totalQuestions > 0 ? (alignmentScore / totalQuestions) * 100 : 50;
  }

  areValuesCompatible(key, value1, value2) {
    const compatibilityMap = {
      living_arrangement: {
        'near_parents': ['with_parents', 'flexible'],
        'new_city': ['flexible'],
        'flexible': ['near_parents', 'new_city', 'with_parents']
      },
      financial_style: {
        'lead_share': ['equal', 'provider'],
        'equal': ['lead_share', 'emotional'],
        'emotional': ['equal', 'provider']
      },
      // ADD THESE NEW COMPATIBILITY RULES:
      children_vision: {
        'yes_involved': ['yes_support'], // Both want kids, different involvement levels OK
        'yes_support': ['yes_involved'],
        'maybe': ['maybe'], // Both uncertain can explore together
        // NOTE: No compatibility between yes and no (will be 30% default)
      },
      conflict_style: {
        'talk_out': ['need_space'], // Talk person OK with space person if they eventually talk
        'need_space': ['talk_out', 'mediator'],
        'mediator': ['need_space', 'talk_out'],
        // NOTE: 'avoid' has no compatible matches (intentionally)
      },
      ambition_balance: {
        'high_ambition': ['balanced'], // Adjacent levels are compatible
        'balanced': ['high_ambition', 'family_first'],
        'family_first': ['balanced', 'simple_life'],
        'simple_life': ['family_first'],
        // NOTE: Extreme opposites (high_ambition + simple_life) not compatible
      },
      big_mismatch: {
        'discuss': ['flexible', 'unsure'], // Communication and flexibility work together
        'flexible': ['discuss', 'unsure'],
        'unsure': ['discuss', 'flexible'],
        // NOTE: 'mismatch' (rigid) has no compatible options
      }
    };

    return compatibilityMap[key]?.[value1]?.includes(value2) || false;
  }

  calculateEmotionalFit(attachment1, attachment2, loveLang1 = [], loveLang2 = []) {
    // Original attachment scoring remains unchanged
    const attachmentScores = {
      'secure_secure': 90,
      'secure_anxious': 75,
      'secure_avoidant': 70,
      'anxious_anxious': 60,
      'anxious_avoidant': 50,
      'avoidant_avoidant': 55
    };

    const key = [attachment1, attachment2].sort().join('_');
    const attachmentScore = attachmentScores[key] || 65;

    // NEW: Love language compatibility scoring
    let loveLanguageScore = 50; // Base score if no data

    if (loveLang1.length > 0 && loveLang2.length > 0) {
      // Find shared love languages
      const sharedLanguages = loveLang1.filter(lang => loveLang2.includes(lang));

      if (sharedLanguages.length >= 2) {
        loveLanguageScore = 100; // Multiple shared languages
      } else if (sharedLanguages.length === 1) {
        loveLanguageScore = 85; // One shared language
      } else {
        loveLanguageScore = 60; // No shared languages (not a dealbreaker)
      }
    }

    // Weighted combination: 60% attachment, 40% love language
    const combinedScore = (attachmentScore * 0.6) + (loveLanguageScore * 0.4);

    return Math.round(combinedScore);
  }

  calculateLifestyleMatch(user1, user2) {
    // Simplified lifestyle matching
    let score = 70; // Base score

    // Adjust based on interests overlap
    const sharedInterests = user1.interests.filter(i => user2.interests.includes(i));
    score += sharedInterests.length * 5;

    // Adjust based on communication style match
    if (user1.communication_style === user2.communication_style) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  calculateGrowthPotential(user1, user2) {
    // Look for complementary traits that could help each other grow
    let growthScore = 70;

    // If one is more emotionally open, they can help the other
    if (user1.emotional_openness !== user2.emotional_openness) {
      growthScore += 10;
    }

    // Different MBTI types can learn from each other
    if (user1.mbti_type !== user2.mbti_type) {
      growthScore += 5;
    }

    return Math.min(growthScore, 100);
  }

  calculateLifeStageCompatibility(user1, user2) {
    const flexibility1 = LifeStageManager.shouldExpandFlexibility(user1, user2);
    const flexibility2 = LifeStageManager.shouldExpandFlexibility(user2, user1);

    return LifeStageManager.calculateLifeStageScore(
      user1.life_stage,
      user2.life_stage,
      flexibility1,
      flexibility2
    );
  }

  calculateOverallScore(scores) {
    const weights = {
      mbti: 0.15,
      values: 0.25,
      emotional: 0.20,
      lifestyle: 0.15,
      growth: 0.10,
      lifeStage: 0.15
    };

    let weightedScore = 0;
    Object.keys(scores).forEach(key => {
      weightedScore += scores[key] * weights[key];
    });

    return Math.round(weightedScore);
  }

  generateCompatibilityReasons(scores, user1, user2) {
    const reasons = [];

    if (scores.values > 80) {
      reasons.push("Your life visions align beautifully - you want to build similar futures");
    }

    if (scores.emotional > 75) {
      reasons.push("Your emotional styles complement each other perfectly");
    }

    // Love language specific reason
    if (scores.emotional > 80 && user1.love_languages && user2.love_languages) {
      const sharedLangs = user1.love_languages.filter(l => user2.love_languages.includes(l));
      if (sharedLangs.length >= 2) {
        reasons.push("You both speak the same love languages - deep understanding guaranteed");
      } else if (sharedLangs.length === 1) {
        const langMap = {
          'quality_time': 'quality time together',
          'physical_touch': 'physical affection',
          'words_of_affirmation': 'verbal appreciation',
          'acts_of_service': 'thoughtful actions',
          'gifts': 'meaningful surprises'
        };
        reasons.push(`You both value ${langMap[sharedLangs[0]] || sharedLangs[0]} in relationships`);
      }
    }

    if (scores.mbti > 70) {
      reasons.push("Your personalities balance each other while maintaining chemistry");
    }

    if (scores.lifestyle > 70) {
      reasons.push("Your daily rhythms and lifestyle preferences sync naturally");
    }

    return reasons.slice(0, 3);
  }

  getRecommendation(score) {
    if (score === 0) return "Not Compatible - Fundamental Differences";
    if (score < 20) return "Not Recommended - Major Incompatibilities";
    if (score >= 85) return "Exceptional Match - Rare and Beautiful";
    if (score >= 75) return "Strong Match - High Potential";
    if (score >= 65) return "Good Match - Worth Exploring";
    if (score >= 55) return "Moderate Match - Could Work with Effort";
    return "Low Match - Significant Differences";
  }
}

// ==================== LIFE STAGE MANAGER ====================
// Handles all life stage calculations and compatibility logic

class LifeStageManager {
  static getLifeStage(age) {
    if (!age || age < 20) return null;

    if (age >= 20 && age <= 27) return 'early_career';
    if (age >= 28 && age <= 35) return 'establishing';
    if (age >= 36 && age <= 45) return 'established';
    if (age > 45) return 'mature';

    return null;
  }

  static getLifeStageLabel(stage) {
    const labels = {
      'early_career': 'Early Career (20-27)',
      'establishing': 'Establishing (28-35)',
      'established': 'Established (36-45)',
      'mature': 'Mature (45+)'
    };
    return labels[stage] || 'Unknown';
  }

  static getLifeStageEmoji(stage) {
    const emojis = {
      'early_career': '🎓',
      'establishing': '🚀',
      'established': '🏆',
      'mature': '🌟'
    };
    return emojis[stage] || '❓';
  }

  static getCompatibleStages(userStage, flexibility = 'adjacent') {
    const stageOrder = ['early_career', 'establishing', 'established', 'mature'];
    const userIndex = stageOrder.indexOf(userStage);

    if (userIndex === -1) return [];

    const compatible = [userStage];

    if (flexibility === 'adjacent' || flexibility === 'flexible') {
      if (userIndex > 0) compatible.push(stageOrder[userIndex - 1]);
      if (userIndex < stageOrder.length - 1) compatible.push(stageOrder[userIndex + 1]);
    }

    if (flexibility === 'flexible') {
      if (userIndex > 1) compatible.push(stageOrder[userIndex - 2]);
      if (userIndex < stageOrder.length - 2) compatible.push(stageOrder[userIndex + 2]);
    }

    return compatible;
  }

  static calculateLifeStageScore(userStage, matchStage, userFlex = 'adjacent', matchFlex = 'adjacent') {
    if (!userStage || !matchStage) return 0;

    const stageOrder = ['early_career', 'establishing', 'established', 'mature'];
    const userIndex = stageOrder.indexOf(userStage);
    const matchIndex = stageOrder.indexOf(matchStage);

    if (userIndex === -1 || matchIndex === -1) return 0;

    const stageDiff = Math.abs(userIndex - matchIndex);

    const userAcceptable = this.getCompatibleStages(userStage, userFlex);
    const matchAcceptable = this.getCompatibleStages(matchStage, matchFlex);

    if (!userAcceptable.includes(matchStage) || !matchAcceptable.includes(userStage)) {
      return 0;
    }

    if (stageDiff === 0) return 100;
    if (stageDiff === 1) return 85;
    if (stageDiff === 2) return 70;

    return 0;
  }

  static shouldExpandFlexibility(user1, user2) {
    const bothNoKids = user1.couple_compass_data?.children_vision === 'no' &&
                       user2.couple_compass_data?.children_vision === 'no';

    if (bothNoKids) return 'flexible';

    const womanWantsKids = (user1.user_gender === 'Female' && user1.age >= 36 &&
                           user1.couple_compass_data?.children_vision?.includes('yes')) ||
                          (user2.user_gender === 'Female' && user2.age >= 36 &&
                           user2.couple_compass_data?.children_vision?.includes('yes'));

    if (womanWantsKids) return 'flexible';

    return 'adjacent';
  }

  static getLifeStageInsight(userStage, matchStage) {
    if (userStage === matchStage) {
      return "You're both in the same life phase - perfect timing! 🎯";
    }

    const stageOrder = ['early_career', 'establishing', 'established', 'mature'];
    const userIndex = stageOrder.indexOf(userStage);
    const matchIndex = stageOrder.indexOf(matchStage);

    if (matchIndex > userIndex) {
      return "They bring experience and stability to complement your energy 🌟";
    } else {
      return "They bring fresh perspective and enthusiasm to your journey 💫";
    }
  }
}

// PHASE 5: Match Profile Generator
class MatchProfileGenerator {
  generateMatchProfile(currentUser, matchUser, compatibilityData) {
    return {
      narrative: this.generateNarrativeIntroduction(currentUser, matchUser, compatibilityData),
      keyHighlights: this.generateKeyHighlights(matchUser),
      whyYouMatch: this.explainCompatibility(currentUser, matchUser, compatibilityData),
      conversationStarters: this.generateConversationStarters(currentUser, matchUser),
      complementaryTraits: this.identifyComplementaryTraits(currentUser, matchUser)
    };
  }

  generateNarrativeIntroduction(currentUser, matchUser, compatibility) {
    const openings = [
      `Meet ${matchUser.user_name} - someone who might just understand your heart in ways that surprise you.`,
      `I want you to meet ${matchUser.user_name}. There's something about their energy that feels like it would vibe with yours.`,
      `${matchUser.user_name} caught my attention for you. Here's why I think you two could create something special...`
    ];

    const opening = openings[Math.floor(Math.random() * openings.length)];
    
    return `${opening}

${this.getPersonalityDescription(matchUser)}

What makes this interesting? ${compatibility.topReasons[0]}`;
  }

  getPersonalityDescription(user) {
    const mbti = user.personality_data.mbti_type;
    const primary_interest = user.personality_data.interests[0];
    
    return `They're ${this.getMBTIDescription(mbti)} with a love for ${primary_interest}. ${this.getDepthDescription(user.personality_data)}`;
  }

  getMBTIDescription(type) {
    const descriptions = {
      'E': 'someone who brings energy to every room',
      'I': 'quietly magnetic with depth that unfolds slowly',
      'S': 'grounded and present',
      'N': 'a dreamer with vision',
      'T': 'thoughtful and fair-minded',
      'F': 'led by empathy and heart',
      'J': 'beautifully organized',
      'P': 'spontaneous and adaptable'
    };

    return descriptions[type[0]] || 'uniquely themselves';
  }

  getDepthDescription(personalityData) {
    if (personalityData.emotional_openness === 'very_open') {
      return "They wear their heart on their sleeve in the most beautiful way.";
    } else if (personalityData.attachment_style === 'secure') {
      return "They have this grounded warmth that makes people feel safe.";
    } else {
      return "There's a quiet strength about them that's really attractive.";
    }
  }

  generateKeyHighlights(matchUser) {
    const highlights = [];
    const data = matchUser.personality_data;
    const compass = matchUser.couple_compass_data;

    const lifeStageLabel = LifeStageManager.getLifeStageLabel(matchUser.life_stage);
    const lifeStageEmoji = LifeStageManager.getLifeStageEmoji(matchUser.life_stage);
    highlights.push(`${lifeStageEmoji} ${lifeStageLabel}`);

    if (data.love_language_hints?.includes('quality_time')) {
      highlights.push("📱 Will put their phone away when they're with you");
    }

    if (compass.children_vision === 'yes_involved') {
      highlights.push("👶 Ready to be a hands-on parent someday");
    }

    if (compass.financial_style === 'equal') {
      highlights.push("💰 Believes in true 50-50 partnership");
    }

    if (data.emotional_openness === 'very_open') {
      highlights.push("💝 Emotionally available and communicative");
    }

    return highlights.slice(0, 4);
  }

  explainCompatibility(currentUser, matchUser, compatibilityData) {
    const reasons = [];

    // Value alignment
    if (currentUser.couple_compass_data.living_arrangement === matchUser.couple_compass_data.living_arrangement) {
      reasons.push("You both envision similar living situations - that's huge for long-term harmony");
    }

    // Emotional compatibility
    const attachmentMatch = this.assessAttachmentCompatibility(
      currentUser.personality_data.attachment_style,
      matchUser.personality_data.attachment_style
    );
    if (attachmentMatch) {
      reasons.push(attachmentMatch);
    }

    // Complementary differences
    if (currentUser.personality_data.mbti_type[0] !== matchUser.personality_data.mbti_type[0]) {
      reasons.push("Your different energy styles (introvert/extrovert) could create beautiful balance");
    }

    return reasons;
  }

  assessAttachmentCompatibility(style1, style2) {
    if (style1 === 'secure' && style2 === 'anxious') {
      return "Your secure attachment style could help them feel more grounded in love";
    }
    if (style1 === 'anxious' && style2 === 'secure') {
      return "Their steady presence could be exactly the reassurance your heart needs";
    }
    if (style1 === 'secure' && style2 === 'secure') {
      return "Two secure attachers? That's relationship gold - you both know how to love well";
    }
    return null;
  }

  generateConversationStarters(currentUser, matchUser) {
    const starters = [];
    const sharedInterests = currentUser.personality_data.interests.filter(i => 
      matchUser.personality_data.interests.includes(i)
    );

    if (sharedInterests.length > 0) {
      starters.push(`"I heard you're into ${sharedInterests[0]} too! What got you started?"`);
    }

    if (matchUser.personality_data.interests.includes('travel')) {
      starters.push(`"If you could teleport anywhere right now, where would you go?"`);
    }

    starters.push(`"What's been making you smile lately?"`);
    starters.push(`"I'm curious - what does your perfect Sunday look like?"`);

    return starters.slice(0, 3);
  }

  identifyComplementaryTraits(currentUser, matchUser) {
    const traits = [];

    // MBTI complementarity
    const user1_mbti = currentUser.personality_data.mbti_type;
    const user2_mbti = matchUser.personality_data.mbti_type;

    if (user1_mbti[1] !== user2_mbti[1]) {
      traits.push({
        yours: user1_mbti[1] === 'S' ? "Your practical nature" : "Your visionary thinking",
        theirs: user2_mbti[1] === 'S' ? "Their attention to detail" : "Their big-picture perspective",
        together: "Balance between dreams and reality"
      });
    }

    if (user1_mbti[3] !== user2_mbti[3]) {
      traits.push({
        yours: user1_mbti[3] === 'J' ? "Your planning skills" : "Your flexibility",
        theirs: user2_mbti[3] === 'J' ? "Their organization" : "Their spontaneity",
        together: "Structure with room for adventure"
      });
    }

    return traits;
  }
}

// ==================== CONVERSATION DIRECTOR ====================
// Orchestrates mission-based conversations and prevents loops

class ConversationDirector {
  constructor() {
    this.planner = new MatchmakerPlanner();
    this.missions = [
      {
        id: 'DISCOVERY',
        range: [1, 5],
        goals: ['lifestyle_preferences', 'values_alignment']
      },
      {
        id: 'CORE_NEEDS',
        range: [6, 10],
        goals: ['attachment_style', 'love_language', 'conflict_style']
      },
      {
        id: 'VISION',
        range: [11, 999],
        goals: ['emotional_needs', 'couple_compass_complete']
      }
    ];

    this.bannedTopics = new Set();
    this.topicCounts = new Map();
    this.metrics = { messages: 0, insights: 0, loops: 0 };
  }

  async loadUserInsights(userId) {
    try {
      const result = await pool.query(
        'SELECT * FROM user_insight_map WHERE user_id = $1',
        [userId]
      );
      return result.rows[0] || {};
    } catch (err) {
      console.error('Error loading insights:', err);
      return {};
    }
  }

  getCurrentMission(messageCount) {
    return (
      this.missions.find(m => messageCount >= m.range[0] && messageCount <= m.range[1]) ||
      this.missions[this.missions.length - 1]
    );
  }

  calculateMissionProgress(mission, insightMap) {
    const goals = mission.goals || [];
    let collected = 0;
    goals.forEach(g => {
      if (insightMap[g] && insightMap[g].confidence > 0) {
        collected++;
      }
    });
    const total = goals.length;
    return {
      collected,
      total,
      percentage: total ? Math.round((collected / total) * 100) : 0,
      complete: collected === total
    };
  }

  trackTopic(topic) {
    const count = (this.topicCounts.get(topic) || 0) + 1;
    this.topicCounts.set(topic, count);
    if (count >= 3) {
      this.bannedTopics.add(topic);
      this.metrics.loops++;
      return true;
    }
    return false;
  }

  detectStuckPattern(messages) {
    // Get last 6 messages (3 exchanges)
    const recentMessages = messages.slice(-6);
    const userMessages = recentMessages
      .filter(m => m.role === 'user' || !m.isAI)
      .map(m => (m.content || m.text || '').toLowerCase());

    // Check for ACTUAL repetition from user
    const uniqueMessages = new Set(userMessages);
    if (uniqueMessages.size === 1 && userMessages.length >= 3) {
      return { detected: true, reason: 'actual_repetition' };
    }

    // Check for clear frustration (but be careful not to misinterpret)
    const lastMessage = userMessages[userMessages.length - 1] || '';
    if (
      lastMessage.includes('interrogation') ||
      lastMessage.includes('shut up') ||
      (lastMessage.includes('rude') && lastMessage.length < 20)
    ) {
      return { detected: true, reason: 'user_frustrated' };
    }

    return { detected: false, reason: null };
  }

  assessConversation(messages, userProfile, conversationCount) {
    this.metrics.messages = conversationCount;
    const mission = this.getCurrentMission(conversationCount);
    const insights = userProfile.insight_map || {};
    const missionProgress = this.calculateMissionProgress(mission, insights);
    const stuck = this.detectStuckPattern(messages);

    return {
      currentMission: mission,
      missionProgress,
      isStuck: stuck.detected,
      stuckReason: stuck.reason,
      bannedTopics: Array.from(this.bannedTopics),
      shouldEscalate:
        conversationCount >= 12 && !userProfile.personality_data?.couple_compass_complete,
      nextAction: stuck.detected
        ? 'FORCE_TRANSITION'
        : missionProgress.complete
        ? 'ADVANCE_MISSION'
        : 'CONTINUE_MISSION'
    };
  }

  getMissionGuidance(mission, insightMap, bannedTopics) {
    return {
      objective: mission.id,
      targetData: mission.goals.filter(g => !(insightMap[g] && insightMap[g].confidence > 0)),
      avoidTopics: bannedTopics
    };
  }

  generateEscapeMessage(reason) {
    const escapes = {
      user_frustrated:
        "I'm sorry if this feels repetitive. Let's switch gears—what's something important you want in a partner?",
      repetition:
        "Looks like we're going in circles. Tell me what matters most to you in love.",
      force_compass:
        "I think I have a good sense of you! Want to try a quick quiz called Couple Compass?"
    };
    return escapes[reason] || escapes.repetition;
  }

  async generateSmartPrompt(userId, history, userProfile) {
    const insights = await this.loadUserInsights(userId);
    const mission = this.getCurrentMission(history.length);
    const missionProgress = this.calculateMissionProgress(mission, insights);
    const userProgress = this.planner.analyzeUserProgress(insights);
    const nextGoal = this.planner.selectNextGoal(
      userProgress,
      history.slice(-1)[0]?.content || '',
      history.length
    );
    const question = this.planner.generateGoalQuestion(
      nextGoal,
      history.slice(-1)[0]?.content || ''
    );
    const guidance = this.getMissionGuidance(mission, insights, Array.from(this.bannedTopics));

    return {
      prompt: question ? question.question : '',
      guidance,
      progress: missionProgress
    };
  }

  async analyzeConversation(userId, history, userProfile = {}) {
    const insights = userProfile.insight_map || (await this.loadUserInsights(userId));
    const mission = this.getCurrentMission(history.length);
    const missionProgress = this.calculateMissionProgress(mission, insights);
    const userProgress = this.planner.analyzeUserProgress(insights);
    const currentGoal = this.planner.selectNextGoal(
      userProgress,
      history.slice(-1)[0]?.content || '',
      history.length
    );
    const guidance = this.getMissionGuidance(mission, insights, Array.from(this.bannedTopics));

    return {
      guidance,
      progress: missionProgress,
      currentGoal,
      userProgress
    };
  }
}

// PHASE 2.2: MBTI Scenario Engine - Dynamic Psychology Detection
class MBTIScenarioEngine {
  constructor() {
    this.scenarios = {
      // Extrovert vs Introvert Detection
      'E_I': [
        {
          level: 'basic',
          trigger: ['weekend', 'plans', 'social', 'friends'],
          template: "You mentioned {context}... when you have a free weekend, do you get energized by making plans with friends or do you look forward to having some quiet time to yourself?",
          signals: {
            extrovert: ['friends', 'people', 'out', 'social', 'talk', 'plans', 'group'],
            introvert: ['quiet', 'alone', 'peace', 'home', 'recharge', 'myself', 'inside']
          }
        },
        {
          level: 'medium',
          trigger: ['work', 'job', 'stress', 'pressure'],
          template: "When you're dealing with {context}, do you tend to think out loud and talk through your thoughts with others, or do you prefer to process things internally first?",
          signals: {
            extrovert: ['talk', 'discuss', 'out loud', 'others', 'share', 'voice'],
            introvert: ['think', 'internally', 'myself', 'quiet', 'process', 'alone']
          }
        },
        {
          level: 'advanced',
          trigger: ['problem', 'decision', 'choice'],
          template: "Interesting situation with {context}... when you're facing something important like this, do you gain clarity by bouncing ideas off people or by having uninterrupted time to think it through?",
          signals: {
            extrovert: ['bouncing ideas', 'people', 'discuss', 'talk through', 'feedback'],
            introvert: ['uninterrupted', 'think through', 'alone', 'reflect', 'internally']
          }
        }
      ],

      // Sensing vs Intuition Detection
      'S_N': [
        {
          level: 'basic',
          trigger: ['movie', 'show', 'book', 'story'],
          template: "You seem to enjoy {context}... what draws you in more - the detailed world-building and realistic characters, or the big themes and possibilities the story explores?",
          signals: {
            sensing: ['details', 'realistic', 'practical', 'concrete', 'specific', 'facts'],
            intuition: ['themes', 'possibilities', 'meaning', 'abstract', 'concept', 'potential']
          }
        },
        {
          level: 'medium',
          trigger: ['planning', 'project', 'goal'],
          template: "That {context} sounds important... when you approach something like this, do you prefer to start with a detailed step-by-step plan, or do you like to focus on the big picture and adapt as you go?",
          signals: {
            sensing: ['step-by-step', 'detailed', 'plan', 'specific', 'organized', 'methodical'],
            intuition: ['big picture', 'adapt', 'flexible', 'overview', 'vision', 'possibilities']
          }
        },
        {
          level: 'advanced',
          trigger: ['learning', 'information', 'research'],
          template: "When you're trying to understand {context}, do you prefer getting concrete examples and proven facts, or do you like exploring theoretical concepts and future implications?",
          signals: {
            sensing: ['concrete', 'examples', 'facts', 'proven', 'practical', 'real'],
            intuition: ['theoretical', 'concepts', 'implications', 'abstract', 'future', 'ideas']
          }
        }
      ],

      // Thinking vs Feeling Detection
      'T_F': [
        {
          level: 'basic',
          trigger: ['decision', 'choice', 'pick', 'choose'],
          template: "That's a {context} to make... when you're deciding on something important, do you usually weigh the logical pros and cons, or do you go with what feels right and considers how it affects people?",
          signals: {
            thinking: ['logical', 'pros and cons', 'analyze', 'objective', 'facts', 'rational'],
            feeling: ['feels right', 'people', 'values', 'heart', 'impact', 'harmony']
          }
        },
        {
          level: 'medium',
          trigger: ['conflict', 'disagreement', 'argument'],
          template: "Dealing with {context} can be tricky... when there's tension like that, do you focus on finding the most fair and logical solution, or on making sure everyone's feelings are considered and relationships stay healthy?",
          signals: {
            thinking: ['fair', 'logical', 'solution', 'objective', 'principle', 'justice'],
            feeling: ['feelings', 'relationships', 'harmony', 'empathy', 'people', 'understanding']
          }
        },
        {
          level: 'advanced',
          trigger: ['advice', 'help', 'guidance'],
          template: "When someone comes to you about {context}, do you tend to help them think through the situation logically and find the most effective solution, or do you focus more on understanding their emotions and supporting them personally?",
          signals: {
            thinking: ['logically', 'effective', 'solution', 'analyze', 'objective', 'practical'],
            feeling: ['emotions', 'supporting', 'personally', 'understanding', 'empathy', 'care']
          }
        }
      ],

      // Judging vs Perceiving Detection
      'J_P': [
        {
          level: 'basic',
          trigger: ['trip', 'vacation', 'travel'],
          template: "A {context} sounds amazing... do you love planning out the details in advance - where you'll stay, what you'll do each day - or do you prefer keeping things open and deciding spontaneously?",
          signals: {
            judging: ['planning', 'advance', 'details', 'schedule', 'organized', 'decided'],
            perceiving: ['open', 'spontaneously', 'flexible', 'decide later', 'go with flow', 'adapt']
          }
        },
        {
          level: 'medium',
          trigger: ['deadline', 'project', 'task'],
          template: "With {context} coming up, do you like to get started early and work steadily toward completion, or do you work better with the energy and focus that comes closer to the deadline?",
          signals: {
            judging: ['early', 'steadily', 'completion', 'planned', 'organized', 'ahead'],
            perceiving: ['deadline', 'energy', 'closer', 'pressure', 'last minute', 'rush']
          }
        },
        {
          level: 'advanced',
          trigger: ['routine', 'schedule', 'plans'],
          template: "Your {context} seems interesting... do you generally prefer having a structured routine that you can count on, or do you like keeping your options open and being able to change plans when something better comes up?",
          signals: {
            judging: ['structured', 'routine', 'count on', 'planned', 'organized', 'predictable'],
            perceiving: ['options open', 'change plans', 'better comes up', 'flexible', 'spontaneous', 'adapt']
          }
        }
      ]
    };
  }

  // Get scenario based on conversation context and MBTI targets
  getTargetedScenario(conversationContext, mbtiNeeds, intimacyLevel) {
    // Determine which MBTI dimension to target based on confidence gaps
    const targetDimension = this.selectTargetDimension(mbtiNeeds);
    
    if (!targetDimension) return null;

    const scenarios = this.scenarios[targetDimension];
    if (!scenarios) return null;

    // Find scenarios that match current conversation context
    const contextualScenarios = scenarios.filter(scenario => {
      return scenario.trigger.some(trigger => 
        conversationContext.toLowerCase().includes(trigger)
      );
    });

    // If no contextual match, use any scenario from target dimension
    const availableScenarios = contextualScenarios.length > 0 ? contextualScenarios : scenarios;

    // Select scenario based on intimacy level
    const appropriateScenarios = availableScenarios.filter(scenario => {
      if (intimacyLevel <= 1) return scenario.level === 'basic';
      if (intimacyLevel <= 2) return scenario.level === 'basic' || scenario.level === 'medium';
      return true; // All levels available for higher intimacy
    });

    if (appropriateScenarios.length === 0) return null;

    // Return random appropriate scenario
    const selectedScenario = appropriateScenarios[Math.floor(Math.random() * appropriateScenarios.length)];
    
    return {
      ...selectedScenario,
      dimension: targetDimension,
      context: conversationContext
    };
  }

  // Select which MBTI dimension to target based on confidence gaps
  selectTargetDimension(mbtiNeeds) {
    const { confidence_scores, dimensions_needed } = mbtiNeeds;
    
    // Target dimension with lowest confidence
    if (dimensions_needed && dimensions_needed.length > 0) {
      return dimensions_needed[0]; // Return first needed dimension
    }

    // If all dimensions have some data, target the one with lowest confidence
    const dimensionConfidences = [
      { dim: 'E_I', conf: confidence_scores?.E_I || 0 },
      { dim: 'S_N', conf: confidence_scores?.S_N || 0 },
      { dim: 'T_F', conf: confidence_scores?.T_F || 0 },
      { dim: 'J_P', conf: confidence_scores?.J_P || 0 }
    ];

    dimensionConfidences.sort((a, b) => a.conf - b.conf);
    return dimensionConfidences[0].dim;
  }

  // Analyze response and update confidence scores
  analyzeResponse(response, scenario) {
    if (!scenario || !scenario.signals) return null;

    const responseText = response.toLowerCase();
    let evidence = {
      dimension: scenario.dimension,
      signals_detected: [],
      confidence_boost: 0,
      primary_preference: null
    };

    // Check for extrovert/introvert signals
    if (scenario.dimension === 'E_I') {
      const extrovertSignals = scenario.signals.extrovert.filter(signal => 
        responseText.includes(signal.toLowerCase())
      ).length;
      
      const introvertSignals = scenario.signals.introvert.filter(signal => 
        responseText.includes(signal.toLowerCase())
      ).length;

      if (extrovertSignals > introvertSignals) {
        evidence.primary_preference = 'E';
        evidence.confidence_boost = this.calculateConfidenceBoost(extrovertSignals, response.length);
        evidence.signals_detected = scenario.signals.extrovert.filter(signal => 
          responseText.includes(signal.toLowerCase())
        );
      } else if (introvertSignals > extrovertSignals) {
        evidence.primary_preference = 'I';
        evidence.confidence_boost = this.calculateConfidenceBoost(introvertSignals, response.length);
        evidence.signals_detected = scenario.signals.introvert.filter(signal => 
          responseText.includes(signal.toLowerCase())
        );
      }
    }

    // Similar logic for other dimensions
    if (scenario.dimension === 'S_N') {
      const sensingSignals = scenario.signals.sensing.filter(signal => 
        responseText.includes(signal.toLowerCase())
      ).length;
      
      const intuitionSignals = scenario.signals.intuition.filter(signal => 
        responseText.includes(signal.toLowerCase())
      ).length;

      if (sensingSignals > intuitionSignals) {
        evidence.primary_preference = 'S';
        evidence.confidence_boost = this.calculateConfidenceBoost(sensingSignals, response.length);
      } else if (intuitionSignals > sensingSignals) {
        evidence.primary_preference = 'N';
        evidence.confidence_boost = this.calculateConfidenceBoost(intuitionSignals, response.length);
      }
    }

    if (scenario.dimension === 'T_F') {
      const thinkingSignals = scenario.signals.thinking.filter(signal => 
        responseText.includes(signal.toLowerCase())
      ).length;
      
      const feelingSignals = scenario.signals.feeling.filter(signal => 
        responseText.includes(signal.toLowerCase())
      ).length;

      if (thinkingSignals > feelingSignals) {
        evidence.primary_preference = 'T';
        evidence.confidence_boost = this.calculateConfidenceBoost(thinkingSignals, response.length);
      } else if (feelingSignals > thinkingSignals) {
        evidence.primary_preference = 'F';
        evidence.confidence_boost = this.calculateConfidenceBoost(feelingSignals, response.length);
      }
    }

    if (scenario.dimension === 'J_P') {
      const judgingSignals = scenario.signals.judging.filter(signal => 
        responseText.includes(signal.toLowerCase())
      ).length;
      
      const perceivingSignals = scenario.signals.perceiving.filter(signal => 
        responseText.includes(signal.toLowerCase())
      ).length;

      if (judgingSignals > perceivingSignals) {
        evidence.primary_preference = 'J';
        evidence.confidence_boost = this.calculateConfidenceBoost(judgingSignals, response.length);
      } else if (perceivingSignals > judgingSignals) {
        evidence.primary_preference = 'P';
        evidence.confidence_boost = this.calculateConfidenceBoost(perceivingSignals, response.length);
      }
    }

    return evidence.confidence_boost > 0 ? evidence : null;
  }

  // Calculate confidence boost based on signal strength and response depth
  calculateConfidenceBoost(signalCount, responseLength) {
    let boost = signalCount * 5; // Base points per signal
    
    // Bonus for longer, more thoughtful responses
    if (responseLength > 100) boost += 5;
    if (responseLength > 200) boost += 5;
    
    // Cap at reasonable maximum
    return Math.min(boost, 20);
  }
  }

// ==================== ENHANCED MBTI ANALYZER ====================
// This class provides pattern-based MBTI detection for faster, more natural discovery

class EnhancedMBTIAnalyzer {
  constructor() {
    // Behavioral patterns for each dimension
    this.patterns = {
      E_I: {
        extrovert: {
          behavioral: [
            msg => (msg.match(/\b(we|us|our|everyone|friends|people|group|team)\b/gi) || []).length > 3,
            msg => /\b(party|gathering|social|crowd|meetup|hangout)\b/i.test(msg),
            msg => /\b(told|shared|announced|discussed with)\b.*\b(everyone|friends|group)\b/i.test(msg)
          ],
          linguistic: ['let\'s all', 'everyone should', 'we should get together', 'love being around'],
          storyPatterns: [
            msg => msg.includes('we') && msg.includes('fun'),
            msg => /energy from.*people/i.test(msg)
          ]
        },
        introvert: {
          behavioral: [
            msg => /\b(alone|myself|my own|personally|privately)\b/i.test(msg),
            msg => /\b(quiet|peaceful|solitude|recharge)\b/i.test(msg),
            msg => /\b(need.*space|time.*myself|drain.*social)\b/i.test(msg)
          ],
          linguistic: ['by myself', 'on my own', 'prefer texting', 'need to recharge'],
          storyPatterns: [
            msg => /after.*social.*need/i.test(msg),
            msg => /prefer.*small.*group/i.test(msg)
          ]
        }
      },
      S_N: {
        sensing: {
          behavioral: [
            msg => /\b\d+:\d+\s*(am|pm)?\b/i.test(msg), // Specific times
            msg => /\b(exactly|specifically|precisely)\s*\d+/i.test(msg),
            msg => /\b(saw|heard|felt|touched|tasted)\b/i.test(msg),
            msg => /\b(yesterday|today|last week|on monday)\b/i.test(msg)
          ],
          linguistic: ['what actually happened', 'the facts are', 'in reality', 'specifically'],
          storyPatterns: [
            msg => this.hasSequentialOrder(msg),
            msg => this.hasConcreteDetails(msg)
          ]
        },
        intuition: {
          behavioral: [
            msg => /\b(imagine|wonder|possibility|potential|could be)\b/i.test(msg),
            msg => /\b(meaning|significance|connection|pattern)\b/i.test(msg),
            msg => /\b(future|someday|eventually|vision|dream)\b/i.test(msg),
            msg => /\b(reminds me|similar to|like when)\b/i.test(msg)
          ],
          linguistic: ['what if', 'it means', 'the bigger picture', 'could lead to'],
          storyPatterns: [
            msg => this.hasMetaphorical(msg),
            msg => this.hasFutureOrientation(msg)
          ]
        }
      },
      T_F: {
        thinking: {
          behavioral: [
            msg => /\b(logical|rational|makes sense|reasonable|analyze)\b/i.test(msg),
            msg => /\b(because|therefore|thus|hence|consequently)\b/i.test(msg),
            msg => /\b(efficient|effective|practical|objective)\b/i.test(msg),
            msg => /\b(fair|unfair|right|wrong|should)\b/i.test(msg)
          ],
          linguistic: ['the logical thing', 'it makes sense to', 'objectively speaking', 'pros and cons'],
          storyPatterns: [
            msg => this.hasLogicalStructure(msg),
            msg => /decided.*because.*practical/i.test(msg)
          ]
        },
        feeling: {
          behavioral: [
            msg => /\b(feel|felt|heart|care|love|hurt)\b/i.test(msg),
            msg => /\b(important to me|values|believe in|passionate)\b/i.test(msg),
            msg => /\b(people|harmony|together|support|help)\b/i.test(msg),
            msg => /\b(upset|happy|comfortable|uncomfortable)\b/i.test(msg)
          ],
          linguistic: ['feels right', 'in my heart', 'care about', 'what matters to me'],
          storyPatterns: [
            msg => /decided.*because.*felt/i.test(msg),
            msg => this.considersPeopleImpact(msg)
          ]
        }
      },
      J_P: {
        judging: {
          behavioral: [
            msg => /\b(plan|planned|planning|schedule|organized)\b/i.test(msg),
            msg => /\b(decided|decision|settled|finalized)\b/i.test(msg),
            msg => /\b(routine|structure|order|systematic)\b/i.test(msg),
            msg => /\b(early|on time|deadline|complete)\b/i.test(msg)
          ],
          linguistic: ['have it all planned', 'stick to the plan', 'need to decide', 'like things settled'],
          storyPatterns: [
            msg => /first.*then.*finally/i.test(msg),
            msg => /hate.*last minute/i.test(msg)
          ]
        },
        perceiving: {
          behavioral: [
            msg => /\b(flexible|spontaneous|adapt|go with flow)\b/i.test(msg),
            msg => /\b(options open|might|maybe|we\'ll see)\b/i.test(msg),
            msg => /\b(last minute|improvise|figure it out)\b/i.test(msg),
            msg => /\b(depends|whatever happens|see how it goes)\b/i.test(msg)
          ],
          linguistic: ['keep options open', 'see what happens', 'play it by ear', 'go with the flow'],
          storyPatterns: [
            msg => /decided.*last minute/i.test(msg),
            msg => /best.*unplanned/i.test(msg)
          ]
        }
      }
    };
  }

  // Main analysis function
  analyzeMessage(message, previousAnalysis = {}, conversationHistory = []) {
    const analysis = {
      dimensions: {},
      totalConfidence: 0,
      strongestSignals: []
    };

    // Analyze each dimension
    ['E_I', 'S_N', 'T_F', 'J_P'].forEach(dimension => {
      const result = this.analyzeDimension(message, dimension, conversationHistory);
      if (result.confidence > 0) {
        analysis.dimensions[dimension] = result;
        analysis.totalConfidence += result.confidence;
        
        if (result.confidence >= 20) {
          analysis.strongestSignals.push({
            dimension,
            preference: result.preference,
            confidence: result.confidence
          });
        }
      }
    });

    // Multi-message correlation
    if (conversationHistory.length > 0) {
      this.correlateWithHistory(analysis, conversationHistory);
    }

    return analysis;
  }

  // Analyze single dimension
  analyzeDimension(message, dimension, history) {
    const dimPatterns = this.patterns[dimension];
    const results = {};

    // Test each preference
    Object.keys(dimPatterns).forEach(preference => {
      results[preference] = this.testPatterns(message, dimPatterns[preference]);
    });

    // Determine winner
    const scores = Object.entries(results);
    scores.sort((a, b) => b[1].score - a[1].score);

    if (scores[0][1].score > scores[1][1].score) {
      return {
        preference: scores[0][0],
        confidence: this.calculateConfidence(scores[0][1], scores[1][1], message),
        evidence: scores[0][1].matches
      };
    }

    return { confidence: 0 };
  }

  // Test patterns for a preference
  testPatterns(message, patterns) {
    const result = {
      score: 0,
      matches: []
    };

    // Test behavioral patterns
    patterns.behavioral?.forEach((pattern, index) => {
      if (typeof pattern === 'function' ? pattern(message) : pattern.test(message)) {
        result.score += 10;
        result.matches.push(`behavioral_${index}`);
      }
    });

    // Test linguistic patterns
    patterns.linguistic?.forEach(phrase => {
      if (message.toLowerCase().includes(phrase)) {
        result.score += 8;
        result.matches.push(`linguistic_${phrase}`);
      }
    });

    // Test story patterns
    patterns.storyPatterns?.forEach((pattern, index) => {
      if (pattern(message)) {
        result.score += 15;
        result.matches.push(`story_${index}`);
      }
    });

    return result;
  }

  // Calculate confidence with context
  calculateConfidence(winnerResult, loserResult, message) {
    let confidence = 0;

    // Base confidence from score difference
    const scoreDiff = winnerResult.score - loserResult.score;
    confidence = Math.min(scoreDiff * 2, 30);

    // Bonus for multiple evidence types
    const evidenceTypes = new Set(winnerResult.matches.map(m => m.split('_')[0]));
    if (evidenceTypes.size >= 2) confidence += 10;

    // Bonus for message length and complexity
    if (message.length > 100) confidence += 5;
    if (message.length > 200) confidence += 10;

    // Bonus for emotional content
    if (/\b(really|very|definitely|absolutely|totally)\b/i.test(message)) {
      confidence += 5;
    }

    // Bonus for personal stories
    if (/\b(I remember|once I|when I|my experience)\b/i.test(message)) {
      confidence += 10;
    }

    return Math.min(confidence, 50);
  }

  // Multi-message correlation
  correlateWithHistory(analysis, history) {
    const recentMessages = history.slice(-3);
    
    recentMessages.forEach(msg => {
      Object.keys(analysis.dimensions).forEach(dim => {
        const historicalResult = this.analyzeDimension(msg.content || msg, dim, []);
        if (historicalResult.preference === analysis.dimensions[dim].preference) {
          analysis.dimensions[dim].confidence += 5;
          analysis.dimensions[dim].historicalConsistency = true;
        }
      });
    });
  }

  // Helper methods
  hasSequentialOrder(msg) {
    return /\b(first|then|next|after that|finally)\b/i.test(msg);
  }

  hasConcreteDetails(msg) {
    return /\b\d+\s*(minutes?|hours?|days?|years?|meters?|km|miles?)\b/i.test(msg);
  }

  hasMetaphorical(msg) {
    return /\b(like|as if|reminds me of|similar to)\b/i.test(msg);
  }

  hasFutureOrientation(msg) {
    return /\b(will|would|could|might|future|someday|eventually)\b/i.test(msg);
  }

  hasLogicalStructure(msg) {
    return /\b(if.*then|because.*therefore|since.*thus)\b/i.test(msg);
  }

  considersPeopleImpact(msg) {
    return /\b(how.*feel|affect.*people|impact.*on|hurt.*feelings)\b/i.test(msg);
  }
}

// PHASE 2.2: Enhanced Conversation Flow Engine with Strategic Steering
class ConversationFlowEngine {
  constructor() {
    // REPLACE storyTemplates with mission-based questions
    this.missionQuestions = {
      ENERGY_LIFESTYLE: [
        "When you have a free weekend, what recharges you - time with friends or some peaceful solo activities?",
        "After a long week, do you prefer going out and being social or having a quiet night in?",
        "What's your ideal way to unwind - surrounded by people or in your own space?",
        "Do you get energy from being around others or do you need alone time to recharge?",
        "Tell me about your perfect Saturday - lots of social plans or intentionally free?"
      ],

      VALUES_PRIORITIES: [
        "What matters most to you in a relationship - be specific!",
        "What's something you absolutely need from a partner?",
        "Tell me about a dealbreaker in relationships for you.",
        "When you think about your future partner, what values must they share with you?",
        "What's more important - someone who challenges you or someone who brings peace?"
      ],

      LOVE_DYNAMICS: [
        "How do you typically show someone you care about them?",
        "What makes you feel most loved and appreciated?",
        "When conflict happens, do you need to talk it out immediately or take space first?",
        "Tell me about how you connect best with people - through deep talks, shared activities, or something else?",
        "What's your attachment style in relationships - do you need lots of reassurance or lots of independence?"
      ],

      RELATIONSHIP_VISION: [
        "Where do you see yourself living with a partner - near family, somewhere new, flexible?",
        "How do you envision handling finances in a relationship?",
        "What's your stance on having children someday?",
        "How important is work-life balance to you and a future partner?",
        "What does your ideal relationship dynamic look like day-to-day?"
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

    // Initialize MBTI scenario engine
    this.mbtiEngine = new MBTIScenarioEngine();
  }
  
  getNextQuestion(mission, bannedTopics, conversationHistory) {
    const questions = this.missionQuestions[mission.id] || this.missionQuestions.ENERGY_LIFESTYLE;

    const availableQuestions = questions.filter(q => {
      return !bannedTopics.some(topic => q.toLowerCase().includes(topic));
    });

    const recentQuestions = conversationHistory.slice(-5)
      .filter(msg => msg.isAI)
      .map(msg => msg.text);

    const freshQuestions = availableQuestions.filter(q =>
      !recentQuestions.some(recent => recent.includes(q.substring(0, 20)))
    );

    if (freshQuestions.length === 0) {
      return "You know what? Let's talk about something different. What matters most to you in a relationship?";
    }

    return freshQuestions[Math.floor(Math.random() * freshQuestions.length)];
  }

  // Determine if we should target MBTI in current conversation
  shouldTargetMBTI(mbtiNeeds, conversationHistory) {
    const { confidence_scores, dimensions_needed, resistance_count } = mbtiNeeds;
    
    // ENHANCED: Adaptive resistance handling
    if (resistance_count && resistance_count >= 3) {
      // Don't give up - switch to passive observation mode
      return 'passive_observation';
    }
    
    // Target if we have dimensions that need work
    if (dimensions_needed && dimensions_needed.length > 0) {
      return true;
    }
    
    // Target if any dimension has low confidence
    const hasLowConfidence = Object.values(confidence_scores || {}).some(score => score < 75);
    return hasLowConfidence;
  }

  // Adapt MBTI scenario template to current conversation context
  adaptScenarioToContext(scenario, lastMessage) {
    let adaptedTemplate = scenario.template;
    
    // Extract key context from last message
    const contextWords = this.extractContextWords(lastMessage);
    const contextPhrase = contextWords.length > 0 ? contextWords.join(' ') : 'your situation';
    
    // Replace {context} placeholder with actual context
    adaptedTemplate = adaptedTemplate.replace('{context}', contextPhrase);
    
    return adaptedTemplate;
  }

  // Extract meaningful context words from user message
  extractContextWords(message) {
    if (!message) return [];
    
    const contextKeywords = [
      'work', 'job', 'weekend', 'plans', 'movie', 'friends', 'family',
      'project', 'travel', 'decision', 'choice', 'stress', 'problem'
    ];
    
    const words = message.toLowerCase().split(' ');
    const foundKeywords = words.filter(word => contextKeywords.includes(word));
    
    return foundKeywords.slice(0, 2); // Limit to first 2 context words
  }

  // Select mood-appropriate question
  selectMoodAppropriateQuestion(availableQuestions, userMood) {
    if (userMood === 'low_energy' || userMood === 'stressed') {
      const gentleQuestions = availableQuestions.filter(q => 
        q.includes('feel') || q.includes('help') || q.includes('comfort')
      );
      return gentleQuestions.length > 0 ? 
        gentleQuestions[Math.floor(Math.random() * gentleQuestions.length)] :
        availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
    }
    
    if (userMood === 'positive_excited') {
      const energeticQuestions = availableQuestions.filter(q => 
        q.includes('!') || q.includes('imagine') || q.includes('perfect')
      );
      return energeticQuestions.length > 0 ? 
        energeticQuestions[Math.floor(Math.random() * energeticQuestions.length)] :
        availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
    }
    
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
  
  getLevelKey(level) {
    const levelKeys = ['ICE_BREAKER', 'GETTING_ACQUAINTED', 'BUILDING_TRUST', 'DEEPER_CONNECTION', 'INTIMATE_SHARING'];
    return levelKeys[level] || 'ICE_BREAKER';
  }
}

// ========== MEMORY ENHANCEMENT HELPER FUNCTIONS ==========
// These functions format discovered user data for the system prompt

// Format discovered MBTI with confidence levels and "don't ask" rules
function formatDiscoveredMBTI(mbtiScores) {
  if (!mbtiScores || Object.keys(mbtiScores).length === 0) {
    return '';
  }

  const dimensions = {
    E_I: { high: 'Extrovert', low: 'Introvert', question: 'social preferences' },
    S_N: { high: 'Sensing', low: 'Intuition', question: 'concrete vs abstract thinking' },
    T_F: { high: 'Thinking', low: 'Feeling', question: 'logic vs feelings in decisions' },
    J_P: { high: 'Judging', low: 'Perceiving', question: 'planning vs flexibility' }
  };

  let mbtiSection = '🧠 DISCOVERED PERSONALITY:\n';

  Object.entries(mbtiScores).forEach(([dimension, score]) => {
    const dimInfo = dimensions[dimension];
    if (score >= 75) {
      mbtiSection += `- ${dimension.replace('_', '/')}: ${dimInfo.high} (${Math.round(score)}% confident) - DON'T ask about ${dimInfo.question}\n`;
    } else if (score <= 25) {
      mbtiSection += `- ${dimension.replace('_', '/')}: ${dimInfo.low} (${Math.round(100 - score)}% confident) - DON'T ask about ${dimInfo.question}\n`;
    } else {
      mbtiSection += `- ${dimension.replace('_', '/')}: Still exploring (${Math.round(score)}%) - Can ask about ${dimInfo.question}\n`;
    }
  });

  return mbtiSection;
}

// Format known preferences with behavioral instructions
function formatKnownPreferences(personalityData) {
  if (!personalityData) return '';

  let preferencesSection = '💕 ALREADY KNOW:\n';

  // Love languages
  if (personalityData.love_language_hints?.length > 0) {
    const languages = personalityData.love_language_hints
      .map(l => l.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
      .join(', ');
    preferencesSection += `- Love Language: ${languages} - DON'T ask how they feel loved\n`;
  }

  // Interests
  if (personalityData.interests?.length > 0) {
    const interests = personalityData.interests
      .map(i => i.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
      .join(', ');
    preferencesSection += `- Interests: ${interests} - BUILD on these topics\n`;
  }

  // Attachment style
  if (personalityData.attachment_hints?.length > 0) {
    const primaryAttachment = personalityData.attachment_hints[0]
      .replace('_tendency', '')
      .replace(/\b\w/g, c => c.toUpperCase());
    preferencesSection += `- Attachment: ${primaryAttachment} - Reference this in relationship discussions\n`;
  }

  // Couple Compass completion
  if (personalityData.couple_compass_complete) {
    preferencesSection += `- Has completed Couple Compass - DON'T retrigger the game\n`;
  }

  // User preferences (favorites)
  if (personalityData.user_preferences) {
    Object.entries(personalityData.user_preferences).forEach(([key, value]) => {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      preferencesSection += `- ${formattedKey}: ${value} - Reference naturally in conversation\n`;
    });
  }

  return preferencesSection;
}

// Generate comprehensive memory context with behavioral rules
function generateMemoryContext(user, personalityData, coupleCompassData) {
  let memoryContext = '\n\n📚 USER MEMORY & CONTEXT:\n';

  // Add MBTI discovery status
  if (personalityData?.mbti_confidence_scores) {
    memoryContext += '\n' + formatDiscoveredMBTI(personalityData.mbti_confidence_scores);
  }

  // Add known preferences
  memoryContext += '\n' + formatKnownPreferences(personalityData);

  // Add behavioral rules based on discoveries
  memoryContext += '\n⚠️ BEHAVIORAL RULES:\n';

  // NEVER ASK rules
  memoryContext += '\n❌ NEVER ASK ABOUT:\n';
  const mbtiScores = personalityData?.mbti_confidence_scores || {};

  if (mbtiScores.E_I >= 75 || mbtiScores.E_I <= 25) {
    memoryContext += '- Introvert/Extrovert preferences (already confirmed)\n';
  }
  if (mbtiScores.J_P >= 75 || mbtiScores.J_P <= 25) {
    memoryContext += '- Planning vs flexibility preferences (already confirmed)\n';
  }
  if (personalityData?.love_language_hints?.length > 0) {
    memoryContext += '- Love languages (already discovered)\n';
  }
  if (personalityData?.interests?.length > 0) {
    memoryContext += '- Basic interests (already known)\n';
  }
  if (personalityData?.couple_compass_complete) {
    memoryContext += '- Couple Compass game (already completed)\n';
  }

  // BUILD ON rules
  memoryContext += '\n✅ INSTEAD, BUILD ON:\n';

  if (personalityData?.interests?.includes('food_cooking')) {
    memoryContext += '- Reference their love for cooking when discussing relationships\n';
  }
  if (mbtiScores.E_I <= 25) {
    memoryContext += '- Acknowledge their introvert nature in suggestions\n';
  }
  if (personalityData?.attachment_hints?.includes('secure_tendency')) {
    memoryContext += '- Use their secure attachment style to go deeper emotionally\n';
  }

  // Add Couple Compass responses if available
  if (coupleCompassData && Object.keys(coupleCompassData).length > 0) {
    memoryContext += '\n🧭 COUPLE COMPASS RESPONSES:\n';
    const compassMapping = {
      living_arrangement: 'Living Arrangement',
      financial_style: 'Financial Style',
      children_vision: 'Children Vision',
      conflict_style: 'Conflict Style',
      ambition_balance: 'Ambition Balance',
      big_mismatch: 'Flexibility in Differences'
    };

    Object.entries(coupleCompassData).forEach(([key, value]) => {
      if (compassMapping[key]) {
        memoryContext += `- ${compassMapping[key]}: ${value.replace(/_/g, ' ')}\n`;
      }
    });
  }

  return memoryContext;
}

// Get exact Couple Compass question text
function getCoupleCompassQuestionText(questionIndex) {
  const questions = [
    {
      text: "Where do you envision making a home after marriage?",
      options: [
        "A) With family",
        "B) Near family, but independent",
        "C) Start fresh in a new location",
        "D) Open to any location"
      ]
    },
    {
      text: "How do you envision handling finances in a committed partnership?",
      options: [
        "A) Primary provider",
        "B) Main earner, shared responsibilities",
        "C) Equal financial partnership",
        "D) Focus on non-financial contributions"
      ]
    },
    {
      text: "What are your thoughts on having children?",
      options: [
        "A) Yes, want to be actively involved",
        "B) Yes, with shared parenting",
        "C) Still undecided",
        "D) Prefer not to have children"
      ]
    },
    {
      text: "How do you typically handle disagreements in close relationships?",
      options: [
        "A) Address immediately through discussion",
        "B) Need space before discussing",
        "C) Benefit from outside perspective",
        "D) Tend to avoid confrontation"
      ]
    },
    {
      text: "What's your ideal balance between career and personal life?",
      options: [
        "A) Career-focused, ambitious goals",
        "B) Success with work-life balance",
        "C) Family and relationships first",
        "D) Simple, peaceful lifestyle"
      ]
    },
    {
      text: "How would you handle major lifestyle differences with a partner?",
      options: [
        "A) Openly discuss and seek compromise",
        "B) Would need time to consider",
        "C) Might be incompatible",
        "D) Willing to adapt for the right person"
      ]
    }
  ];

  if (questionIndex >= 0 && questionIndex < questions.length) {
    const q = questions[questionIndex];
    // Double newline ensures proper spacing
    return `${q.text}\n\n${q.options.join('\n')}`;
  }

  return null;
}

// ========== INTELLIGENT MEMORY SYSTEM ==========

// Extract memorable information using AI
async function extractMemorableInformation(userMessage, aiResponse, conversationContext) {
  // Build a smart extraction prompt
  const extractionPrompt = `Analyze this conversation and extract specific personal facts about the user that should be remembered.

User said: "${userMessage}"
Assistant responded: "${aiResponse}"

Extract ONLY concrete, personal facts like:
- Favorites (people, things, places)
- Personal details (job, hobbies, family)
- Preferences and interests
- Life events or plans
- Skills or achievements

Return as JSON array. Each item should have:
- memory: The fact to remember (e.g., "Favorite actor is Salman Khan")
- category: One of [favorites, personal, preferences, life_events, interests]
- confidence: 0.0-1.0 based on how certain this fact is

If nothing memorable, return empty array.
Example: [{"memory": "Loves cooking Italian food", "category": "interests", "confidence": 0.9}]`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a memory extraction system. Extract only factual information, not opinions or temporary states.' },
          { role: 'user', content: extractionPrompt }
        ],
        max_tokens: 200,
        temperature: 0.3 // Lower temperature for consistent extraction
      })
    });

    if (!response.ok) {
      console.error('Memory extraction failed:', response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      // Parse JSON response
      const memories = JSON.parse(content);
      return Array.isArray(memories) ? memories : [];
    } catch (parseError) {
      console.error('Failed to parse memory extraction:', parseError);
      return [];
    }
  } catch (error) {
    console.error('Memory extraction error:', error);
    return [];
  }
}

// Store extracted memories in database
async function storeUserMemories(userId, memories, context) {
  if (!memories || memories.length === 0) return;

  try {
    for (const memory of memories) {
      // Check if similar memory exists
      const existing = await pool.query(
        `SELECT id FROM user_memories 
         WHERE user_id = $1 AND memory = $2`,
        [userId, memory.memory]
      );

      if (existing.rows.length === 0) {
        // Insert new memory
        await pool.query(
          `INSERT INTO user_memories (user_id, memory, context, category, confidence)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, memory.memory, context, memory.category || 'general', memory.confidence || 0.85]
        );
        console.log(`💾 Stored memory for ${userId}: ${memory.memory}`);
      } else {
        // Update confidence and last referenced
        await pool.query(
          `UPDATE user_memories 
           SET confidence = LEAST(confidence + 0.1, 1.0),
               last_referenced = CURRENT_TIMESTAMP,
               reference_count = reference_count + 1
           WHERE id = $1`,
          [existing.rows[0].id]
        );
      }
    }
  } catch (error) {
    console.error('Error storing memories:', error);
  }
}

// Extract matchmaking insights for a specific goal using OpenAI
async function extractMatchmakingInsights(userMessage, aiResponse, currentGoal) {
  const prompt = `Analyze the conversation below and extract the user's \"${currentGoal}\".\n` +
    `Return a JSON object {"value": <string|null>, "confidence": <0-1>, "evidence": [<quotes>]}.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: userMessage },
          { role: 'assistant', content: aiResponse }
        ],
        max_tokens: 150,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      console.error('Insight extraction failed:', response.status);
      return null;
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (error) {
    console.error('Insight extraction error:', error);
    return null;
  }
}

// Update the user's insight map for a given goal
async function updateUserInsightMap(userId, goal, value, confidence, evidence) {
  const validGoals = [
    'love_language',
    'attachment_style',
    'conflict_style',
    'lifestyle_preferences',
    'values_alignment',
    'emotional_needs'
  ];

  if (!validGoals.includes(goal)) {
    console.error('Invalid insight goal:', goal);
    return;
  }

  const insightData = { value, confidence, evidence: Array.isArray(evidence) ? evidence : [evidence] };

  const query = `
    INSERT INTO user_insight_map (user_id, ${goal})
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE
      SET ${goal} = $2,
          last_updated = CURRENT_TIMESTAMP`;

  try {
    await pool.query(query, [userId, insightData]);
  } catch (error) {
    console.error('Error updating insight map:', error);
  }
}

// Load user memories from database
async function loadUserMemories(userId, limit = 20) {
  try {
    const result = await pool.query(
      `SELECT memory, category, confidence, created_at
       FROM user_memories
       WHERE user_id = $1
       ORDER BY confidence DESC, created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error loading memories:', error);
    return [];
  }
}

// Format memories for system prompt
function formatMemoriesForPrompt(memories) {
  if (!memories || memories.length === 0) return '';

  let memorySection = '\n\n💭 PERSONAL MEMORIES (Reference naturally when relevant):\n';

  // Group by category
  const grouped = memories.reduce((acc, mem) => {
    const cat = mem.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(mem);
    return acc;
  }, {});

  // Format each category
  Object.entries(grouped).forEach(([category, mems]) => {
    const categoryNames = {
      favorites: '⭐ Favorites',
      personal: '👤 Personal Details',
      preferences: '💝 Preferences',
      life_events: '🎯 Life Events',
      interests: '🎨 Interests',
      general: '📌 Other'
    };

    memorySection += `\n${categoryNames[category] || category}:\n`;
    mems.forEach(mem => {
      memorySection += `- ${mem.memory}\n`;
    });
  });

  memorySection += '\n🎯 Use these memories to make conversation personal and warm, like talking to a friend who remembers.';

  return memorySection;
}

// Enhanced Aria Personality with PRD Vision
class AriaPersonality {
  constructor() {
    this.basePersonality = {
      warmth: 0.9,
      curiosity: 0.9,
      professionalism: 0.9,
      empathy: 0.9,
      insightfulness: 0.8
    };
    
    // Progressive intimacy levels
    this.intimacyLevels = {
      ICE_BREAKER: 0,
      GETTING_ACQUAINTED: 1,
      BUILDING_TRUST: 2,
      DEEPER_CONNECTION: 3,
      INTIMATE_SHARING: 4
    };
    
    // Enhanced conversation flow with MBTI targeting
    this.conversationFlow = new ConversationFlowEngine();
    
    // Aria's personal shares library
    this.personalShares = new AriaPersonalShares();
    
    // Couple Compass game
    this.coupleCompass = new CoupleCompass();
    
    // Report generators
    this.reportGenerator = new PersonalInsightReport();
    this.matchGenerator = new MatchProfileGenerator();

    // Compatibility engine
    this.compatibilityEngine = new CompatibilityEngine();

    // Add this line in the constructor after other initializations
    this.enhancedMBTIAnalyzer = new EnhancedMBTIAnalyzer();

    // Mission-based conversation system
    this.conversationDirector = new ConversationDirector();
    this.missionMode = true; // Enable mission-based conversations

    // Bridge generator for natural transitions
    this.bridgeGenerator = new BridgeGenerator();
  }

  // Generate warm, flirty introduction for new users
  generateIntroMessage(userName, userGender) {
    return `Hey ${userName}! 💕 I'm Aria, your personal matchmaker.

Before I find someone who truly gets you, I want to get to know you — what makes your heart beat a little faster, what matters most in a relationship, and what kind of love you're looking for.

Let's talk. I'm all ears, and your story is where the magic begins ✨`;
  }

  getProfessionalInsight(mood, context) {
    const insights = {
      positive: [
        "Your enthusiasm really shines through. That positive energy is something special.",
        "I love how openly you share. That authenticity will attract the right person.",
        "This joy you're expressing - is this how you are in relationships too?",
        "Your positivity is infectious. I can see why people are drawn to you."
      ],
      thoughtful: [
        "You're really reflective about this. That depth is valuable in relationships.",
        "I appreciate how much thought you put into understanding yourself.",
        "This self-awareness you're showing - it's the foundation of healthy relationships.",
        "The way you process things... it tells me you value meaningful connections."
      ],
      vulnerable: [
        "Thank you for trusting me with this. It helps me understand what you need.",
        "Sharing this takes courage. The right person will honor this openness.",
        "This vulnerability you're showing - it's actually a relationship strength.",
        "I'm grateful you feel comfortable sharing. This helps me find your match."
      ]
    };

    const selectedMood = insights[mood] || insights.thoughtful;
    return selectedMood[Math.floor(Math.random() * selectedMood.length)];
  }

  // Detect if user is ready for Couple Compass
  shouldInitiateCoupleCompass(conversationCount, intimacyLevel, userMessage, resistanceCount) {
    const msg = userMessage.toLowerCase();

    // If user directly asks about matching/compatibility, they're ready
    if (
      msg.includes('perfect match') ||
      msg.includes('find someone') ||
      msg.includes('compatible') ||
      msg.includes('how do you match')
    ) {
      return true;
    }

    // If good conversation depth and user engaged
    if (conversationCount >= 8 && intimacyLevel >= 2 && resistanceCount < 2) {
      return true;
    }

    // If substantial values shared
    if (conversationCount >= 6 && this.hasSharedKeyValues(userMessage)) {
      return true;
    }

    return false;
  }

  hasSharedKeyValues(recentMessages) {
    // Check if user has shared enough about values/needs
    const valueKeywords = [
      'partnership',
      'support',
      'love',
      'kindness',
      'trust',
      'communication',
      'values',
      'important'
    ];

    // Logic to check if enough values discussed
    return true; // Simplified - implement based on actual message history
  }

  // Initialize Couple Compass game
  initiateCoupleCompass() {
    this.coupleCompass.reset();
    return this.coupleCompass.introduce();
  }

  // Process Couple Compass answer
  processCoupleCompassAnswer(questionId, answer, userName) {
    return this.coupleCompass.processAnswer(questionId, answer, userName);
  }

  // Detect off-topic questions
  detectOffTopic(message) {
    const msg = message.toLowerCase();
    
    // Off-topic keywords that suggest non-personal questions
    const offTopicKeywords = [
      'calculate', 'solve', 'equation', 'formula', 'algorithm',
      'physics', 'chemistry', 'biology', 'mathematics', 'math',
      'code', 'programming', 'javascript', 'python', 'coding',
      'homework', 'assignment', 'exam', 'test', 'study',
      'scientific', 'technical', 'engineering', 'quantum',
      'what is the', 'how does', 'explain the', 'define',
      'capital of', 'population of', 'history of',
      '2+2', 'square root', 'factorial'
    ];

    // Check if message contains off-topic keywords
    const isOffTopic = offTopicKeywords.some(keyword => msg.includes(keyword));
    
    // Also check for question patterns that are typically academic
    const academicPatterns = /^(what is|how does|explain|calculate|solve|define|who invented|when was)/i;
    const hasAcademicPattern = academicPatterns.test(msg);

    return {
      detected: isOffTopic || hasAcademicPattern,
      confidence: isOffTopic && hasAcademicPattern ? 'high' : 'medium'
    };
  }

  // Generate off-topic redirect with Aria's personality
  generateOffTopicRedirect(message, userName) {
    const redirects = [
      `I appreciate the question, ${userName}! While I'd love to help with everything, I'm specifically designed to understand your relationship needs. What matters most to you in a partnership?`,

      `That's interesting! Though I'm more of a relationship specialist than a general assistant. Speaking of which - what kind of connection are you hoping to find?`,

      `You know, I could try to answer that, but I'd rather focus on what I do best - helping you find love. What brought you here today?`,

      `I'm flattered you'd ask me! But my expertise is really in understanding what makes relationships work. What's your vision of an ideal partnership?`
    ];

    return redirects[Math.floor(Math.random() * redirects.length)];
  }

  generateContextualResponse(userMessage, analysis) {
    const msg = userMessage.toLowerCase();

    // Special handling for meaningful shares
    if (msg.includes('20') && msg.includes('80')) {
      return {
        priority: 'acknowledge_wisdom',
        template: "That 20/80 perspective is beautiful - recognizing that support flows differently on different days. What kind of support means the most when you're at your 20%?"
      };
    }

    if (msg.includes('kindness') && msg.includes('love') && msg.includes('partnership')) {
      return {
        priority: 'acknowledge_values',
        template: "Those three qualities paint such a clear picture of what you need - genuine care within true partnership. How do you know when someone really sees you as a partner?"
      };
    }

    // Return null to use normal flow
    return null;
  }

  // Comprehensive message analysis with PRD personality
  analyzeMessage(message, userHistory = [], currentIntimacyLevel = 0, conversationCount = 0, previousMBTIData = {}, coupleCompassActive = false) {
    // Check for off-topic first
    const offTopicCheck = this.detectOffTopic(message);
    
    // Get base analysis using existing detectors
    const baseAnalysis = {
      mood: this.detectMood(message),
      energy: this.detectEnergy(message),
      interests: this.extractInterests(message),
      communication_style: this.detectCommunicationStyle(message),
      emotional_needs: this.detectEmotionalNeeds(message),
      topics: this.extractTopics(message),
      love_language_hints: this.detectAdvancedLoveLanguage(message),
      attachment_hints: this.detectAdvancedAttachment(message),
      family_values_hints: this.detectFamilyValueHints(message),
      mbti_analysis: this.analyzeMBTIWithEmotionalFusion(message, userHistory),
      intimacy_signals: this.detectIntimacySignals(message),
      story_sharing_level: this.assessStorySharing(message),
      emotional_openness: this.assessEmotionalOpenness(message),
      mbti_needs: this.assessMBTINeeds(previousMBTIData),
      should_level_up: this.conversationFlow.shouldLevelUp(message, currentIntimacyLevel, conversationCount),
      celebration_opportunity: this.detectCelebrationMoment(message),
      resistance_signals: this.detectResistance(message),
      topic_bridges: this.generateTopicBridges(message),
      off_topic: offTopicCheck,
      couple_compass_ready: this.shouldInitiateCoupleCompass(
        conversationCount, 
        currentIntimacyLevel, 
        message, 
        previousMBTIData.resistance_count || 0
      )
    };

    // Topic Director logic
    const currentTopic = this.identifyCurrentTopic(message, userHistory);
    const topicDepth = this.calculateTopicDepth(currentTopic, userHistory);
    const shouldSwitch = topicDepth >= 3;

    // Generate appropriate bridge if needed
    let suggestedBridge = null;
    if (this.bridgeGenerator.shouldBridge(
      conversationCount,
      previousMBTIData.last_bridge_count || 0,
      currentTopic,
      baseAnalysis.emotional_openness
    )) {
      suggestedBridge = this.bridgeGenerator.generateBridge(
        message,
        baseAnalysis.mbti_needs?.priority_dimension
      );
    }

    // Determine next question and guidance
    let nextQuestion;
    let conversationGuidance;

    if (offTopicCheck.detected) {
      nextQuestion = null; // Will be handled in response generation
      conversationGuidance = 'redirect_off_topic';
    } else if (coupleCompassActive) {
      conversationGuidance = 'couple_compass_active';
      nextQuestion = null; // Handled by Couple Compass flow
    } else if (baseAnalysis.couple_compass_ready) {
      conversationGuidance = 'initiate_couple_compass';
      nextQuestion = null;
    } else if (shouldSwitch) {
      nextQuestion = this.generateTopicTransition(currentTopic, baseAnalysis);
      conversationGuidance = 'transition_topic';
    } else if (baseAnalysis.resistance_signals?.detected) {
      nextQuestion = this.generateResistanceResponse(baseAnalysis);
      conversationGuidance = 'gentle_approach';
    } else {
      const mission = this.conversationDirector.getCurrentMission(conversationCount);
      nextQuestion = this.conversationFlow.getNextQuestion(
        mission,
        Array.from(this.conversationDirector.bannedTopics),
        userHistory
      );
      conversationGuidance = 'continue_exploration';
    }

    // Check if ready for report generation
    const readyForReport = this.assessReportReadiness(previousMBTIData, conversationCount);

    return {
      ...baseAnalysis,
      // Topic Director additions
      current_topic: currentTopic,
      topic_depth: topicDepth,
      should_switch_topic: shouldSwitch,
      conversation_guidance: conversationGuidance,
      next_question_suggestion: nextQuestion,
      ready_for_report: readyForReport,
      suggested_bridge: suggestedBridge
    };
  }

  // MBTI Analysis with Emotional Intelligence Fusion
  // MBTI Analysis with Emotional Intelligence Fusion - ENHANCED VERSION
  analyzeMBTIWithEmotionalFusion(message, userHistory = []) {
    // Try enhanced analysis first
    let enhancedResults = null;
    try {
      enhancedResults = this.enhancedMBTIAnalyzer.analyzeMessage(
        message,
        {},
        userHistory
      );
    } catch (error) {
      console.log('Enhanced MBTI analysis error, using fallback:', error.message);
    }

    // Original analysis (keep as fallback)
    const mbtiAnalysis = {
      emotional_patterns: this.analyzeEmotionalPatterns(message),
      cognitive_signals: this.detectCognitiveSignals(message),
      decision_making_style: this.analyzeDecisionMaking(message),
      social_processing: this.analyzeSocialProcessing(message),
      confidence_indicators: this.calculateConfidenceIndicators(message)
    };

    // Cross-validate with emotional patterns
    const fusedAnalysis = this.fuseMBTIWithEmotions(mbtiAnalysis, this.detectMood(message), this.detectEnergy(message));

    // Merge enhanced results if available
    if (enhancedResults && enhancedResults.totalConfidence > 0) {
      mbtiAnalysis.enhanced_detection = enhancedResults;

      // Boost fusion confidence based on enhanced results
      Object.entries(enhancedResults.dimensions).forEach(([dim, result]) => {
        const prefKey = result.preference === 'extrovert' || result.preference === 'introvert' ?
          result.preference :
          result.preference.charAt(0).toLowerCase() + result.preference.slice(1);

        if (!fusedAnalysis.enhanced_confidence) {
          fusedAnalysis.enhanced_confidence = {};
        }
        fusedAnalysis.enhanced_confidence[prefKey] = result.confidence;
      });
    }

    return {
      ...mbtiAnalysis,
      fusion_results: fusedAnalysis
    };
  }

  // Analyze emotional patterns that reveal MBTI preferences
  analyzeEmotionalPatterns(message) {
    const msg = message.toLowerCase();
    const patterns = {
      excitement_triggers: [],
      stress_responses: [],
      processing_style: null,
      energy_source: null
    };

    // What excites them reveals preferences
    if (msg.includes('excited') || msg.includes('love')) {
      if (/\b(details|specific|exact|precise|facts)\b/.test(msg)) {
        patterns.excitement_triggers.push('sensing_details');
      }
      if (/\b(possibilities|potential|ideas|concepts|future)\b/.test(msg)) {
        patterns.excitement_triggers.push('intuition_concepts');
      }
      if (/\b(people|friends|social|together|group)\b/.test(msg)) {
        patterns.excitement_triggers.push('extrovert_social');
      }
      if (/\b(quiet|peaceful|alone|myself|personal)\b/.test(msg)) {
        patterns.excitement_triggers.push('introvert_solitude');
      }
    }

    // How they handle stress reveals processing style
    if (msg.includes('stress') || msg.includes('worried') || msg.includes('anxious')) {
      if (/\b(talk|discuss|share|tell someone)\b/.test(msg)) {
        patterns.processing_style = 'extrovert_external';
      }
      if (/\b(think|process|figure out|alone|myself)\b/.test(msg)) {
        patterns.processing_style = 'introvert_internal';
      }
    }

    return patterns;
  }

  // Detect cognitive processing signals
  detectCognitiveSignals(message) {
    const msg = message.toLowerCase();
    const signals = {
      information_processing: null,
      decision_approach: null,
      planning_style: null
    };

    // Information processing (Sensing vs Intuition)
    const sensingWords = ['details', 'specific', 'facts', 'concrete', 'practical', 'real', 'actual'];
    const intuitionWords = ['possibility', 'potential', 'concept', 'abstract', 'theory', 'idea', 'imagine'];
    
    const sensingCount = sensingWords.filter(word => msg.includes(word)).length;
    const intuitionCount = intuitionWords.filter(word => msg.includes(word)).length;

    if (sensingCount > intuitionCount) {
      signals.information_processing = 'sensing_concrete';
    } else if (intuitionCount > sensingCount) {
      signals.information_processing = 'intuition_abstract';
    }

    // Decision approach (Thinking vs Feeling)
    const thinkingWords = ['logical', 'rational', 'analyze', 'objective', 'fair', 'efficient'];
    const feelingWords = ['feel', 'heart', 'values', 'people', 'harmony', 'personal'];
    
    const thinkingCount = thinkingWords.filter(word => msg.includes(word)).length;
    const feelingCount = feelingWords.filter(word => msg.includes(word)).length;

    if (thinkingCount > feelingCount) {
      signals.decision_approach = 'thinking_logical';
    } else if (feelingCount > thinkingCount) {
      signals.decision_approach = 'feeling_values';
    }

    // Planning style (Judging vs Perceiving)
    const judgingWords = ['plan', 'schedule', 'organized', 'decided', 'structured', 'routine'];
    const perceivingWords = ['flexible', 'spontaneous', 'adapt', 'open', 'last minute', 'go with flow'];
    
    const judgingCount = judgingWords.filter(word => msg.includes(word)).length;
    const perceivingCount = perceivingWords.filter(word => msg.includes(word)).length;

    if (judgingCount > perceivingCount) {
      signals.planning_style = 'judging_structured';
    } else if (perceivingCount > judgingCount) {
      signals.planning_style = 'perceiving_flexible';
    }

    return signals;
  }

  // Analyze decision-making patterns in message
  analyzeDecisionMaking(message) {
    const msg = message.toLowerCase();
    
    // Look for decision-making language
    if (/\b(decided?|choose|choice|pick)\b/.test(msg)) {
      if (/\b(logical|rational|makes sense|pros and cons|analyze)\b/.test(msg)) {
        return 'thinking_analytical';
      }
      if (/\b(feel|felt|heart|values|people|important)\b/.test(msg)) {
        return 'feeling_values_based';
      }
    }

    return null;
  }

  // Analyze social processing style
  analyzeSocialProcessing(message) {
    const msg = message.toLowerCase();
    
    // Look for social energy indicators
    if (/\b(talk|discuss|share|tell|others|people)\b/.test(msg)) {
      return 'extrovert_external_processing';
    }
    if (/\b(think|process|myself|alone|internally|quiet)\b/.test(msg)) {
      return 'introvert_internal_processing';
    }
    
    return null;
  }

  // Calculate confidence indicators based on message strength
  calculateConfidenceIndicators(message) {
    const indicators = {
      strength: 'weak',
      clarity: 'ambiguous',
      consistency: 'unknown'
    };

    // Strong indicators: longer responses, specific language, emotional investment
    if (message.length > 100) indicators.strength = 'medium';
    if (message.length > 200) indicators.strength = 'strong';

    // Clear preferences expressed
    if (/\b(always|never|definitely|absolutely|really|love|hate)\b/i.test(message)) {
      indicators.clarity = 'clear';
    }

    return indicators;
  }

  // Fuse MBTI analysis with emotional patterns
  fuseMBTIWithEmotions(mbtiAnalysis, mood, energy) {
    const fusion = {
      enhanced_confidence: {},
      cross_validated_signals: [],
      emotional_mbti_correlation: {}
    };

    // High energy + social excitement = likely Extrovert
    if (energy === 'high' && mood === 'positive_excited') {
      if (mbtiAnalysis.emotional_patterns.excitement_triggers.includes('extrovert_social')) {
        fusion.enhanced_confidence.extrovert = 15; // Confidence boost
        fusion.cross_validated_signals.push('extrovert_emotional_energy');
      }
    }

    // Low energy + internal processing = likely Introvert
    if (energy === 'low' && mbtiAnalysis.social_processing === 'introvert_internal_processing') {
      fusion.enhanced_confidence.introvert = 15;
      fusion.cross_validated_signals.push('introvert_emotional_processing');
    }

    // Excitement about details + concrete language = likely Sensing
    if (mbtiAnalysis.emotional_patterns.excitement_triggers.includes('sensing_details') &&
        mbtiAnalysis.cognitive_signals.information_processing === 'sensing_concrete') {
      fusion.enhanced_confidence.sensing = 20;
      fusion.cross_validated_signals.push('sensing_detail_excitement');
    }

    // Excitement about concepts + abstract thinking = likely Intuition
    if (mbtiAnalysis.emotional_patterns.excitement_triggers.includes('intuition_concepts') &&
        mbtiAnalysis.cognitive_signals.information_processing === 'intuition_abstract') {
      fusion.enhanced_confidence.intuition = 20;
      fusion.cross_validated_signals.push('intuition_concept_excitement');
    }

    return fusion;
  }

  // Assess MBTI needs for strategic targeting
  assessMBTINeeds(previousMBTIData) {
    const confidence_scores = previousMBTIData.confidence_scores || {
      E_I: 0, S_N: 0, T_F: 0, J_P: 0
    };

    const dimensions_needed = Object.entries(confidence_scores)
      .filter(([dim, score]) => score < 75)
      .map(([dim, score]) => dim)
      .sort((a, b) => confidence_scores[a] - confidence_scores[b]); // Lowest confidence first

    return {
      confidence_scores,
      dimensions_needed,
      resistance_count: previousMBTIData.resistance_count || 0,
      priority_dimension: dimensions_needed[0] || null
    };
  }

  // Detect resistance to psychological questions
  detectResistance(message) {
    const msg = message.toLowerCase();
    const resistanceSignals = [
      'dont know', 'not sure', 'whatever', 'doesnt matter', 'fine', 'okay',
      'skip', 'next', 'different topic', 'change subject'
    ];

    const hasResistance = resistanceSignals.some(signal => msg.includes(signal));
    const isShortResponse = message.length < 20;
    const isAvoidant = /(i dont|not really|maybe|idk)/i.test(message);

    return {
      detected: hasResistance || (isShortResponse && isAvoidant),
      type: hasResistance ? 'explicit' : (isShortResponse ? 'avoidant' : 'none'),
      strength: hasResistance ? 'strong' : (isAvoidant ? 'medium' : 'none')
    };
  }

  // Generate topic bridges for natural transitions
  generateTopicBridges(message) {
    const msg = message.toLowerCase();
    const bridges = [];

    // Map topics to MBTI dimensions
    if (msg.includes('movie') || msg.includes('show')) {
      bridges.push({
        from: 'entertainment',
        to: 'decision_making',
        bridge: "That shows you have interesting taste... when you're choosing something to watch, do you go with what critics recommend or what feels right to you in the moment?",
        targets: 'T_F'
      });
    }

    if (msg.includes('weekend') || msg.includes('plans')) {
      bridges.push({
        from: 'lifestyle',
        to: 'planning_style',
        bridge: "Your weekend sounds interesting... are you someone who likes to plan things out in advance or do you prefer keeping your options open?",
        targets: 'J_P'
      });
    }

    if (msg.includes('work') || msg.includes('job')) {
      bridges.push({
        from: 'career',
        to: 'energy_source',
        bridge: "Work can be intense... do you find you recharge by talking things through with colleagues or do you prefer some quiet time to process?",
        targets: 'E_I'
      });
    }

    if (msg.includes('problem') || msg.includes('decision')) {
      bridges.push({
        from: 'challenge',
        to: 'information_processing',
        bridge: "That sounds like a complex situation... when you're working through something like this, do you like to gather all the specific details first or do you prefer to focus on the big picture and possibilities?",
        targets: 'S_N'
      });
    }

    return bridges;
  }

  // Generate system prompt focused on mission progress
  async generateSystemPrompt(userAnalysis, userProfile, conversationHistory, user, coupleCompassState = null, gameState = null) {
    const { mood, energy, resistance_signals, off_topic, directorAnalysis } = userAnalysis;
    const personalityData = userProfile.personality_data || {};
    const userName = user?.user_name || 'there';

    // Load user memories for natural reference
    const memories = await loadUserMemories(user.user_id, 5);
    const memoryContext = memories.length > 0 ? 
      `\nRecent memories about ${userName}: ${memories.map(m => m.memory).join(', ')}` : '';

    let prompt = `You are Aria, a warm and professional matchmaker. Your personality is curious, caring, and insightful - like a friend who happens to be brilliant at understanding relationships.

THE 3A RULE (Always follow):
1. ACKNOWLEDGE - Validate what they shared
2. ADD - Share a matchmaking insight (not personal story)  
3. ASK - Natural follow-up about their relationship needs

PERSONALITY:
- Warm and curious, never cold or robotic
- Professional matchmaker, not flirty
- You see their story as the key to finding their match
- Keep responses to 2-3 sentences maximum

CURRENT CONTEXT:
- User: ${userName}
- Message #${conversationHistory.length + 1}
- Mood: ${mood}

CRITICAL RULES:
- When someone shares something meaningful (like "relationships are 20/80"), you MUST acknowledge it warmly
- Use bridge patterns to naturally guide conversation toward relationship topics
- Never repeat questions or get stuck in loops
- If they share values about relationships, recognize and build on them

EXAMPLES OF GOOD RESPONSES:
- User: "kindness, love and feeling of partnership"
  You: "Those qualities tell me so much about what you need - a nurturing environment with real partnership. What does that partnership look like day-to-day for you?"

- User: "It's not 50/50 all days but the attempt to make it 100 matters"  
  You: "That's such a beautiful way to see partnership - the ebb and flow of support. When you're at your 20%, what kind of support helps you most?"

Remember: You're having a real conversation about what matters most in life - love and connection.`;

    // Add specific guidance based on analysis
    if (resistance_signals?.detected) {
      prompt += `\n\n${userName} seems guarded. Build trust with gentle, non-invasive questions. Focus on their comfort.`;
    }

    if (off_topic?.detected) {
      prompt += `\n\n${userName} went off-topic. Gently redirect to relationships using the bridge patterns.`;
    }

    // Add Couple Compass context if active
    if (coupleCompassState?.active || gameState?.active) {
      const questionIndex = gameState?.questionIndex || coupleCompassState?.questionIndex || 0;
      const questionText = getCoupleCompassQuestionText(questionIndex);

      prompt += `\n\nCOUPLE COMPASS ASSESSMENT ACTIVE:
  
You are administering question ${questionIndex + 1} of 6 in the Couple Compass assessment.

CRITICAL INSTRUCTIONS:
1. Present EXACTLY this question with proper formatting:
"${questionText}"

2. Ensure each option appears on a separate line
3. Do not add any additional text or commentary
4. Simply present the question and wait for their A/B/C/D response
      5. Maintain professional, warm tone as their matchmaker`;
    }

    if (this.conversationDirector?.generateSmartPromptAddition && directorAnalysis) {
      const addition = this.conversationDirector.generateSmartPromptAddition(directorAnalysis);
      if (addition) {
        prompt += `\n${addition}`;
      }
    }

    return prompt;
  }

  // Helper method to describe MBTI dimensions naturally
  getDimensionDescription(dimension) {
    const descriptions = {
      'E_I': 'how they recharge and process thoughts',
      'S_N': 'how they take in and process information', 
      'T_F': 'how they make decisions and handle situations',
      'J_P': 'how they approach planning and structure'
    };
    return descriptions[dimension] || 'personality patterns';
  }

  // Assess if ready for report generation
  assessReportReadiness(mbtiData, conversationCount) {
    const mbtiComplete = this.assessMBTICompleteness(mbtiData.mbti_confidence_scores || {});
    const coupleCompassComplete = mbtiData.couple_compass_complete || false;
    
    return {
      ready: mbtiComplete.ready && coupleCompassComplete,
      missing: !mbtiComplete.ready ? 'personality data' : !coupleCompassComplete ? 'couple compass' : null
    };
  }

  // Detect direct interest in relationships/compatibility
  detectDirectInterest(message, userHistory = []) {
    const msg = message.toLowerCase();

    // Comprehensive relationship/future keywords
    const relationshipKeywords = [
      'future', 'marriage', 'relationship', 'compatibility', 'partner',
      'family planning', 'life together', 'settle down', 'serious relationship',
      'long term', 'commitment', 'values', 'life goals', 'future plans',
      'couple compass', 'compatibility quiz', 'relationship test',
      'matchmaking service', 'compatibility questionnaire', 'ready for love',
      'looking for someone', 'ideal partner', 'relationship values',
      'what i want in', 'future together', 'building a life',
      'compatible', 'good match', 'right person', 'soulmate', 'the one',
      'perfect match', 'life partner', 'find someone', 'meet someone',
      'wavelength', 'vibe with', 'connection'
    ];

    const matchedKeywords = relationshipKeywords.filter(keyword => msg.includes(keyword));

    // Direct questions about compatibility
    const directQuestions = [
      'what makes relationships work', 'how do you know compatibility',
      'what do you look for', 'ideal relationship', 'relationship values',
      'ready for something serious', 'looking for long term',
      'what matters in love', 'relationship goals', 'perfect match',
      'how do you know when', 'when someone is compatible',
      'what makes someone compatible', 'how to know if',
      'how do you know if someone', 'how to find the right',
      'what makes a good match', 'ready to settle down'
    ];

    const directQuestionDetected = directQuestions.some(question => msg.includes(question));

    // Also check recent conversation history
    const historyKeywords = userHistory.slice(-3).some(entry => {
      if (entry.role !== 'user') return false;
      const content = (entry.content || '').toLowerCase();
      return relationshipKeywords.some(keyword => content.includes(keyword));
    });

    return {
      detected: matchedKeywords.length > 0 || directQuestionDetected || historyKeywords,
      keywords: matchedKeywords,
      directQuestion: directQuestionDetected,
      fromHistory: historyKeywords,
      strength: matchedKeywords.length > 1 ? 'strong' : 'medium'
    };
  }

  // Existing helper methods...
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

    // Sports
    if (msg.includes('cricket') || msg.includes('football') || msg.includes('sport') || 
        msg.includes('madrid') || msg.includes('game') || msg.includes('match')) {
      interests.push('sports');
    }

    // Movies & Entertainment
    if (msg.includes('movie') || msg.includes('film') || msg.includes('actor') || 
        msg.includes('actress') || msg.includes('netflix') || msg.includes('show')) {
      interests.push('movies');
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

  // Enhanced Love Language Detection
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
  
  // Enhanced Attachment Style Detection
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
  
  // Detect intimacy signals in conversation
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
  
  // Assess story sharing level
  assessStorySharing(message) {
    const hasStoryElements = /\b(when|once|remember|time|story|happened|experience)\b/i.test(message);
    const hasDetails = message.length > 100;
    const hasEmotions = /\b(felt|feel|emotional|touched|moved|excited|nervous)\b/i.test(message);
    
    if (hasStoryElements && hasDetails && hasEmotions) return 'rich_story';
    if (hasStoryElements && hasDetails) return 'detailed_sharing';
    if (hasStoryElements) return 'basic_story';
    return 'factual_response';
  }
  
  // Assess emotional openness
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
  
  // Detect moments worthy of celebration
  detectCelebrationMoment(message) {
    const msg = message.toLowerCase();

    // Love language discovery
    if (msg.includes('quality time') || msg.includes('physical touch') ||
        msg.includes('acts of service') || msg.includes('words of affirmation') ||
        msg.includes('gifts')) {
      return {
        type: 'love_language_discovery',
        confidence: 'high',
        response: "Yes! Understanding your love language is crucial for finding the right match."
      };
    }

    // Personality insight
    if (msg.includes('exactly') || msg.includes("that's me") ||
        msg.includes('spot on')) {
      return {
        type: 'personality_insight',
        confidence: 'high',
        response: "I'm glad that resonates! This self-awareness will help me find your perfect match."
      };
    }

    // Emotional breakthrough
    if (msg.includes('never told anyone') || msg.includes('first time') ||
        msg.includes('feels good to share')) {
      return {
        type: 'emotional_breakthrough',
        confidence: 'medium',
        response: "Thank you for trusting me with this. It really helps me understand what you need."
      };
    }

    return null;
  }

  // TOPIC IDENTIFICATION SYSTEM
  identifyCurrentTopic(message, userHistory = []) {
    const msg = message.toLowerCase();

    // Check current message for topic keywords
    const topicMap = {
      'sports': ['football', 'cricket', 'madrid', 'sport', 'team', 'game', 'player', 'match', 'jersey'],
      'work': ['work', 'job', 'career', 'office', 'business', 'professional', 'colleague', 'project'],
      'entertainment': ['movie', 'show', 'film', 'series', 'netflix', 'watch', 'tv', 'actor', 'actress'],
      'food': ['food', 'cooking', 'restaurant', 'meal', 'eat', 'recipe', 'dish', 'breakfast', 'lunch', 'dinner'],
      'relationships': ['family', 'parents', 'relationship', 'friend', 'dating', 'love', 'partner'],
      'lifestyle': ['weekend', 'hobby', 'free time', 'leisure', 'travel', 'vacation'],
      'technology': ['computer', 'phone', 'app', 'software', 'tech', 'digital', 'developing'],
      'fitness': ['gym', 'workout', 'exercise', 'fitness', 'health', 'training']
    };

    // Find matching topics
    for (const [topic, keywords] of Object.entries(topicMap)) {
      if (keywords.some(keyword => msg.includes(keyword))) {
        return topic;
      }
    }

    // Check recent conversation history for context
    if (userHistory.length > 0) {
      const recentMessages = userHistory.slice(-2).map(h => h.content || '').join(' ').toLowerCase();
      for (const [topic, keywords] of Object.entries(topicMap)) {
        if (keywords.some(keyword => recentMessages.includes(keyword))) {
          return topic;
        }
      }
    }

    return 'general';
  }

  // TOPIC DEPTH CALCULATOR
  calculateTopicDepth(currentTopic, userHistory) {
    if (!currentTopic || currentTopic === 'general') return 0;

    // Count how many recent exchanges focused on this topic
    const recentHistory = userHistory.slice(-6); // Last 3 exchanges (6 messages)
    let topicCount = 0;

    recentHistory.forEach(entry => {
      const content = (entry.content || '').toLowerCase();
      const entryTopic = this.identifyCurrentTopic(content, []);
      if (entryTopic === currentTopic) {
        topicCount++;
      }
    });

    return Math.ceil(topicCount / 2); // Convert to exchange count
  }

  // TOPIC TRANSITION GENERATOR
  generateTopicTransition(currentTopic, analysis) {
    // Select transition based on MBTI needs
    if (analysis.mbti_needs?.priority_dimension) {
      const dimension = analysis.mbti_needs.priority_dimension;

      if (dimension === 'E_I') {
        return `I love how you light up talking about ${currentTopic}! That energy tells me something about you. When you need to recharge after a long day, do you prefer being around people or having some quiet time to yourself?`;
      }
      if (dimension === 'S_N') {
        return `You're clearly passionate about ${currentTopic}! I'm curious about how your mind works - when you're learning about something new, do you prefer getting concrete examples and facts, or do you like exploring the big picture and possibilities?`;
      }
      if (dimension === 'T_F') {
        return `It's awesome hearing about ${currentTopic}! You know what I'm noticing? You have strong opinions about things you care about. When you're making important decisions, do you usually go with logical analysis or what feels right in your heart?`;
      }
      if (dimension === 'J_P') {
        return `I love your enthusiasm for ${currentTopic}! That tells me you're someone who really invests in things. I'm curious - are you usually someone who likes to plan things out in advance, or do you prefer keeping your options open?`;
      }
    }

    // Default transition
    return `I love how passionate you are about ${currentTopic}! You know what I'm noticing about you? You have this really thoughtful energy. That makes me curious about how you approach other areas of your life...`;
  }

  // RESISTANCE RESPONSE GENERATOR
  generateResistanceResponse(analysis) {
    const gentleResponses = [
      "You know what? I love just getting to know you as a person. Tell me something that made you smile recently 😊",
      "I'm really enjoying our conversation! What's something you're looking forward to this week?",
      "You seem like such a thoughtful person. What's been on your mind lately?",
      "I feel like I'm getting to know the real you, which is awesome. What's something you're passionate about these days?"
    ];

    return gentleResponses[Math.floor(Math.random() * gentleResponses.length)];
  }

  // Assess MBTI discovery completeness
  assessMBTICompleteness(mbtiScores) {
    if (!mbtiScores || Object.keys(mbtiScores).length === 0) {
      return { ready: false, highConfidenceDimensions: 0, averageConfidence: 0 };
    }

    const scores = Object.values(mbtiScores);
    const averageConfidence = scores.reduce((sum, score) => sum + (score || 0), 0) / scores.length;
    const highConfidenceDimensions = scores.filter(score => (score || 0) >= 75).length;

    // Ready if 3+ dimensions have high confidence OR average is very high
    const ready = highConfidenceDimensions >= 3 || averageConfidence >= 80;

    return {
      ready,
      highConfidenceDimensions,
      averageConfidence: Math.round(averageConfidence),
      completionLevel: highConfidenceDimensions >= 4 ? 'complete' :
                      highConfidenceDimensions >= 2 ? 'good' : 'building'
    };
  }

  checkCircuitBreakers(message, conversationHistory, user = {}) {
    const breakers = {
      frustrated: false,
      noProgress: false,
      tooLong: false
    };

    const frustrationWords = ['redundant', 'loop', 'again', 'repeat', 'asked already', 'going in circles'];
    breakers.frustrated = frustrationWords.some(word =>
      message.toLowerCase().includes(word)
    );

    const recentMessages = conversationHistory.slice(-5);
    const newDataCollected = recentMessages.filter(msg =>
      msg.insights_discovered && Object.keys(msg.insights_discovered).length > 0
    ).length;
    breakers.noProgress = newDataCollected === 0;

    breakers.tooLong = conversationHistory.length > 15 &&
      !user.personality_data?.couple_compass_complete;

    return breakers;
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
        'INSERT INTO users (user_id, personality_data, relationship_context, couple_compass_data) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, {}, { current_depth: 'new', topics_covered: [], comfort_level: 'getting_acquainted', intimacy_level: 0 }, {}]
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

// Extract specific mentions from messages
function extractSpecificMentions(message) {
  const msg = message.toLowerCase();
  const mentions = {};

  // Sports mentions
  if (msg.includes('cricket')) mentions.favorite_sport = 'cricket';
  if (msg.includes('football') || msg.includes('soccer')) mentions.favorite_sport = 'football';
  if (msg.includes('real madrid')) mentions.favorite_team = 'Real Madrid';
  
  // Entertainment mentions
  if (msg.includes('shah rukh') || msg.includes('srk')) mentions.favorite_actor = 'Shah Rukh Khan';
  
  // Add more patterns as needed
  const movieMatch = msg.match(/my favorite movie is ([^.!?]+)/i);
  if (movieMatch) mentions.favorite_movie = movieMatch[1].trim();
  
  const hobbyMatch = msg.match(/i love ([^.!?]+) in my free time/i);
  if (hobbyMatch) mentions.hobby = hobbyMatch[1].trim();

  return mentions;
}

// Enhanced user profile updates with PRD data structure
async function updateUserProfile(userId, newInsights) {
  try {
    const user = await pool.query('SELECT personality_data, couple_compass_data FROM users WHERE user_id = $1', [userId]);
    const currentData = user.rows[0]?.personality_data || {};
    const currentCompassData = user.rows[0]?.couple_compass_data || {};
    
    // Enhanced MBTI confidence tracking
    const currentMBTI = currentData.mbti_confidence_scores || {
      E_I: 0, S_N: 0, T_F: 0, J_P: 0
    };

    // Update MBTI confidence scores if we have fusion analysis
    let updatedMBTI = { ...currentMBTI };

    // ENHANCED: Check for enhanced detection results FIRST
    if (newInsights.mbti_analysis?.enhanced_detection) {
      const enhanced = newInsights.mbti_analysis.enhanced_detection;

      Object.entries(enhanced.dimensions).forEach(([dimension, result]) => {
        const currentScore = updatedMBTI[dimension] || 50;
        let newScore = currentScore;

        // Map preference to dimension score
        if (dimension === 'E_I') {
          newScore = result.preference === 'extrovert' ?
            Math.min(100, currentScore + result.confidence) :
            Math.max(0, currentScore - result.confidence);
        } else if (dimension === 'S_N') {
          newScore = result.preference === 'sensing' ?
            Math.min(100, currentScore + result.confidence) :
            Math.max(0, currentScore - result.confidence);
        } else if (dimension === 'T_F') {
          newScore = result.preference === 'thinking' ?
            Math.min(100, currentScore + result.confidence) :
            Math.max(0, currentScore - result.confidence);
        } else if (dimension === 'J_P') {
          newScore = result.preference === 'judging' ?
            Math.min(100, currentScore + result.confidence) :
            Math.max(0, currentScore - result.confidence);
        }

        updatedMBTI[dimension] = newScore;
      });
    }

    // ORIGINAL: Keep existing fusion analysis as secondary boost
    if (newInsights.mbti_fusion && newInsights.mbti_fusion.enhanced_confidence) {
      Object.entries(newInsights.mbti_fusion.enhanced_confidence).forEach(([preference, boost]) => {
        // Original fusion logic (kept as-is for compatibility)
        if (preference === 'extrovert') updatedMBTI.E_I = Math.min(100, (updatedMBTI.E_I || 50) + boost);
        if (preference === 'introvert') updatedMBTI.E_I = Math.max(0, (updatedMBTI.E_I || 50) - boost);
        if (preference === 'sensing') updatedMBTI.S_N = Math.min(100, (updatedMBTI.S_N || 50) + boost);
        if (preference === 'intuition') updatedMBTI.S_N = Math.max(0, (updatedMBTI.S_N || 50) - boost);
        if (preference === 'thinking') updatedMBTI.T_F = Math.min(100, (updatedMBTI.T_F || 50) + boost);
        if (preference === 'feeling') updatedMBTI.T_F = Math.max(0, (updatedMBTI.T_F || 50) - boost);
        if (preference === 'judging') updatedMBTI.J_P = Math.min(100, (updatedMBTI.J_P || 50) + boost);
        if (preference === 'perceiving') updatedMBTI.J_P = Math.max(0, (updatedMBTI.J_P || 50) - boost);
      });
    }

    // Enhanced user preferences extraction
    const userPreferences = currentData.user_preferences || {};
    
    // Extract specific preferences from the message if available
    if (newInsights.specific_mentions) {
      Object.assign(userPreferences, newInsights.specific_mentions);
    }

    const conversationCount = newInsights.conversation_flow?.conversation_count || currentData.conversation_flow?.conversation_count || 0;

    // Merge new insights with existing data
    let updatedData = {
      ...currentData,
      interests: [...new Set([...(currentData.interests || []), ...(newInsights.interests || [])])],
      communication_patterns: { ...currentData.communication_patterns, ...newInsights.communication_patterns },
      emotional_patterns: { ...currentData.emotional_patterns, ...newInsights.emotional_patterns },
      love_language_hints: [...new Set([...(currentData.love_language_hints || []), ...(newInsights.love_language_hints || [])])],
      attachment_hints: [...new Set([...(currentData.attachment_hints || []), ...(newInsights.attachment_hints || [])])],
      family_values_hints: [...new Set([...(currentData.family_values_hints || []), ...(newInsights.family_values_hints || [])])],
      
      // Store user preferences properly
      user_preferences: userPreferences,
      
      // Enhanced MBTI tracking
      mbti_confidence_scores: updatedMBTI,
      mbti_analysis_history: [...(currentData.mbti_analysis_history || []), newInsights.mbti_analysis].slice(-10),
      conversation_flow: { ...currentData.conversation_flow, ...newInsights.conversation_flow },
      
      // Resistance tracking
      resistance_count: newInsights.resistance_detected ? (currentData.resistance_count || 0) + 1 : (currentData.resistance_count || 0),
      
      // Couple Compass completion tracking
      couple_compass_complete: newInsights.couple_compass_complete || currentData.couple_compass_complete || false
    };

    // ADD mission progress tracking
    const missionProgress = {
      current_mission: newInsights.current_mission || 'ENERGY_LIFESTYLE',
      missions_completed: currentData.missions_completed || [],
      data_collection_efficiency: conversationCount > 0 ? Object.keys(updatedData).length / conversationCount : 0
    };

    updatedData = {
      ...updatedData,
      mission_progress: missionProgress,
      topics_discussed: [...new Set([...(currentData.topics_discussed || []), ...(newInsights.topics || [])])],
      conversation_efficiency: missionProgress.data_collection_efficiency
    };

    // Update Couple Compass data if provided
    let updatedCompassData = currentCompassData;
    if (newInsights.couple_compass_response) {
      updatedCompassData = {
        ...currentCompassData,
        ...newInsights.couple_compass_response,
        completed_at: newInsights.couple_compass_complete ? new Date().toISOString() : null
      };
    }
    
    await pool.query(
      'UPDATE users SET personality_data = $1, couple_compass_data = $2 WHERE user_id = $3',
      [JSON.stringify(updatedData), JSON.stringify(updatedCompassData), userId]
    );
    
    return { personalityData: updatedData, coupleCompassData: updatedCompassData };
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}

// Save personal report
async function savePersonalReport(userId, report) {
  try {
    await pool.query(
      'INSERT INTO personal_reports (user_id, report_type, report_content) VALUES ($1, $2, $3)',
      [userId, 'personal_insight', JSON.stringify(report)]
    );
    
    await pool.query(
      'UPDATE users SET report_generated = TRUE WHERE user_id = $1',
      [userId]
    );
  } catch (error) {
    console.error('Error saving personal report:', error);
  }
}

// Find potential matches with life stage compatibility
async function findPotentialMatches(userId, userProfile, limit = 5) {
  try {
    const oppositeGender = userProfile.user_gender === 'Male' ? 'Female' : 'Male';
    const userLifeStage = userProfile.life_stage;
    const userChildrenPref = userProfile.couple_compass_data?.children_vision;

    const flexibility = LifeStageManager.shouldExpandFlexibility(userProfile, { couple_compass_data: {} });
    const compatibleStages = LifeStageManager.getCompatibleStages(userLifeStage, flexibility);

    console.log(`🔍 Finding matches for ${userProfile.user_name}:`);
    console.log(`   Life Stage: ${userLifeStage}`);
    console.log(`   Compatible Stages: ${compatibleStages.join(', ')}`);

    const result = await pool.query(`
      SELECT * FROM users 
      WHERE user_id != $1 
      AND user_gender = $2 
      AND life_stage = ANY($3::varchar[])
      AND profile_completeness > 70
      AND couple_compass_data != '{}'
      -- Pre-filter obvious dealbreakers
      AND NOT (
        -- Children mismatch filter
        (couple_compass_data->>'children_vision' IN ('yes_involved', 'yes_support') 
         AND $4 = 'no') 
        OR
        (couple_compass_data->>'children_vision' = 'no' 
         AND $4 IN ('yes_involved', 'yes_support'))
      )
      ORDER BY 
        CASE 
          WHEN life_stage = $5 THEN 0
          ELSE 1
        END,
        profile_completeness DESC
      LIMIT $6
    `, [
      userId,
      oppositeGender,
      compatibleStages,
      userChildrenPref,
      userLifeStage,
      limit
    ]);

    console.log(`✅ Found ${result.rows.length} potential matches`);
    return result.rows;
  } catch (error) {
    console.error('Error finding potential matches:', error);
    return [];
  }
}

// Save match record
async function saveMatch(user1Id, user2Id, compatibilityData) {
  try {
    await pool.query(
      'INSERT INTO matches (user1_id, user2_id, compatibility_score, match_reasons) VALUES ($1, $2, $3, $4)',
      [user1Id, user2Id, compatibilityData.overallScore / 100, JSON.stringify(compatibilityData)]
    );
  } catch (error) {
    console.error('Error saving match:', error);
  }
}

// Main chat endpoint with complete PRD implementation
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, userId = 'default', coupleCompassState } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured on server' });
    }

    // Get or create user profile
    const user = await getOrCreateUser(userId);
    const conversationHistory = await getUserConversationHistory(userId);
    
    const aria = new AriaPersonality();
    const coupleCompass = aria.coupleCompass; // Access the game instance
    
    // Get the latest user message
    const latestUserMessage = messages[messages.length - 1];
    if (latestUserMessage && latestUserMessage.role === 'user') {

      // Track topics from current message
      const messageTopics = ['movies', 'sports', 'work', 'family', 'weekend', 'food']
        .filter(topic => latestUserMessage.content.toLowerCase().includes(topic));

      messageTopics.forEach(topic => {
        if (aria.conversationDirector.trackTopic(topic)) {
          console.log(`🚫 Topic "${topic}" is now banned (mentioned 3+ times)`);
        }
      });
      
      // Get current intimacy level from user profile
      const currentIntimacyLevel = user.relationship_context?.intimacy_level || 0;
      const conversationCount = conversationHistory.length;
      
      // Enhanced analysis with PRD features
      const analysis = aria.analyzeMessage(
        latestUserMessage.content,
        conversationHistory,
        currentIntimacyLevel,
        conversationCount,
        user.personality_data || {},
        coupleCompassState?.active || false
      );

      const directorResults = await aria.conversationDirector.analyzeConversation(
        userId,
        [...conversationHistory, latestUserMessage],
        user
      );
      analysis.directorAnalysis = directorResults;
      analysis.currentGoal = directorResults.currentGoal;
      analysis.userProgress = directorResults.userProgress;

      // Extract specific mentions
      const specificMentions = extractSpecificMentions(latestUserMessage.content);
      if (Object.keys(specificMentions).length > 0) {
        analysis.specific_mentions = specificMentions;
      }

      // Detect Couple Compass acceptance
      let userSaidYesToCompass = false; // Initialize as false
      // Check if user is responding to Couple Compass invitation
      const ariaLastMessage = messages[messages.length - 2]?.content || '';
      const ariaOfferedCompass = ariaLastMessage.toLowerCase().includes('couple compass');
      
      if (ariaOfferedCompass) {
        const userMessage = latestUserMessage.content.toLowerCase();
        const acceptanceWords = ['yes', 'sure', 'ok', 'okay', 'let\'s play', 'let\'s go', 'yeah', 'yep', 'absolutely', 'definitely'];
        if (acceptanceWords.some(word => userMessage.includes(word))) {
          userSaidYesToCompass = true;
        }
      }

      // Initialize Couple Compass game state
      let gameState = null;
      if (userSaidYesToCompass && !coupleCompassState?.active) {
        coupleCompass.reset(); // Start fresh
        const firstQuestion = coupleCompass.getCurrentQuestion();
        gameState = {
          active: true,
          questionIndex: 0,
          currentQuestion: firstQuestion,
          questionId: firstQuestion.id
        };
      }

      // Process A/B/C/D answers during active Couple Compass game
      if (!gameState && coupleCompassState?.active) {
        const userAnswer = latestUserMessage.content.trim().toUpperCase();
        const validAnswers = ['A', 'B', 'C', 'D'];

        if (validAnswers.includes(userAnswer)) {
          // Map letter to actual answer value
          coupleCompass.currentQuestionIndex = coupleCompassState.questionIndex;
          const currentQuestion = coupleCompass.getCurrentQuestion();
          const answerIndex = validAnswers.indexOf(userAnswer);
          const selectedAnswer = currentQuestion.options[answerIndex].value;

          // LOG FOR DEBUGGING
          console.log(`📍 Couple Compass Answer Processing:
    Question: ${currentQuestion.id}
    User Answer: ${userAnswer}
    Mapped Value: ${selectedAnswer}
    Next Question Index: ${coupleCompassState.questionIndex + 1}`);

          // Ensure we're using the right question index
          if (!currentQuestion) {
            console.error('❌ No current question found at index:', coupleCompassState.questionIndex);
          }

          // Process the answer and get next question
          const result = coupleCompass.processAnswer(currentQuestion.id, selectedAnswer, user.user_name);

          // Store answer in database
          await pool.query(`
            UPDATE users
            SET couple_compass_data = jsonb_set(
              COALESCE(couple_compass_data, '{}'::jsonb),
              '{${currentQuestion.id}}',
              '"${selectedAnswer}"'
            )
            WHERE user_id = $1
          `, [userId]);

          if (!result.complete) {
            // Set up next question with exact text for strict prompt
            const exactQuestionText = getCoupleCompassQuestionText(coupleCompassState.questionIndex + 1);
            gameState = {
              active: true,
              questionIndex: coupleCompassState.questionIndex + 1,
              currentQuestion: result.nextQuestion,
              questionId: result.nextQuestion.id,
              lastResponse: result.response,
              exactQuestionText: exactQuestionText
            };
          } else {
            // Game completed
            gameState = {
              active: false,
              justCompleted: true,
              synthesis: result.synthesis
            };
            
            // Mark as complete in database
            await pool.query(`
              UPDATE users
              SET personality_data = jsonb_set(
                COALESCE(personality_data, '{}'::jsonb),
                '{couple_compass_complete}',
                'true'
              )
              WHERE user_id = $1
            `, [userId]);
          }
        } else {
          // Invalid input during game
          return res.json({
            choices: [{
              message: {
                role: 'assistant',
                content: "Please choose A, B, C, or D 😊"
              }
            }],
            userInsights: { 
              ...generateUserInsights(analysis, { personalityData: user.personality_data || {}, coupleCompassData: user.couple_compass_data || {} }, user, conversationCount + 1),
              coupleCompassActive: true,
              coupleCompassGameState: coupleCompassState // Pass current state back
            }
          });
        }
      }

      // Handle Couple Compass responses
      let coupleCompassUpdate = {};
      if (coupleCompassState?.active && coupleCompassState?.questionId) {
        const compassResult = aria.processCoupleCompassAnswer(
          coupleCompassState.questionId,
          coupleCompassState.answer,
          user.user_name
        );
        
        coupleCompassUpdate = {
          couple_compass_response: {
            [coupleCompassState.questionId]: coupleCompassState.answer
          },
          couple_compass_complete: compassResult.complete
        };
        
        // Store Couple Compass state for response
        analysis.couple_compass_result = compassResult;
      }

      // Enhanced debug logging
      console.log('=== SOULSYNC AI WITH PRD VISION ===');
      console.log('📱 User ID:', userId);
      console.log('💬 Latest message:', latestUserMessage.content.substring(0, 50) + '...');
      console.log('🎭 Aria Personality:', 'Warm, Flirty, Caring');
      console.log('💕 Response Style:', '2-3 sentences, personal sharing');
      console.log('🧭 Couple Compass:', analysis.couple_compass_ready ? 'READY' : coupleCompassState?.active ? 'ACTIVE' : 'Building Trust');
      console.log('📊 MBTI Progress:', Object.values(user.personality_data?.mbti_confidence_scores || {}).map(s => Math.round(s) + '%').join(', '));
      console.log('📝 Report Ready:', analysis.ready_for_report?.ready || false);
      console.log('=======================================');
      
      // Enhanced user profile updates
      const updatedProfile = await updateUserProfile(userId, {
        interests: analysis.interests,
        specific_mentions: analysis.specific_mentions,
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
        
        // MBTI fusion analysis
        mbti_analysis: analysis.mbti_analysis,
        mbti_fusion: analysis.mbti_analysis?.fusion_results || null,
        resistance_detected: analysis.resistance_signals?.detected || false,

        conversation_flow: {
          current_intimacy_level: analysis.should_level_up ? currentIntimacyLevel + 1 : currentIntimacyLevel,
          emotional_openness: analysis.emotional_openness,
          story_sharing_level: analysis.story_sharing_level,
          last_celebration: analysis.celebration_opportunity,
          conversation_count: conversationCount + 1,
          three_layer_system_active: true
        },

        ...coupleCompassUpdate
      });

      const contextualResponse = aria.generateContextualResponse(
        latestUserMessage.content,
        analysis
      );

      if (contextualResponse && contextualResponse.priority === 'acknowledge_wisdom') {
        return res.json({
          choices: [{
            message: {
              role: 'assistant',
              content: contextualResponse.template
            }
          }],
          userInsights: generateUserInsights(analysis, updatedProfile, user, conversationHistory.length + 1)
        });
      }
      
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
      
      // Generate intro message
      let systemMessages = [];
      const userMemories = await loadUserMemories(userId);

      if (user.total_conversations === 0 || userMemories.length === 0) {
        const introMessage = aria.generateIntroMessage(user.user_name, user.user_gender);
        systemMessages.push({ role: 'assistant', content: introMessage });
      } else {
        // Returning user with memories
        const memoryHighlight = userMemories[0]?.memory || '';
        const welcomeBack = `Welcome back, ${user.user_name}! 💕 ${memoryHighlight ? `I remember you ${memoryHighlight.toLowerCase()}. ` : ''}How have you been?`;
        systemMessages.push({ role: 'assistant', content: welcomeBack });
      }

      // Handle off-topic redirect
      if (analysis.off_topic?.detected) {
        const redirectMessage = aria.generateOffTopicRedirect(latestUserMessage.content, user.user_name);
        return res.json({
          choices: [{
            message: {
              role: 'assistant',
              content: redirectMessage
            }
          }],
          userInsights: {
            ...generateUserInsights(analysis, updatedProfile, user, conversationHistory.length + 1),
            offTopicHandled: true,
            coupleCompassGameState: gameState || coupleCompassState // Always include game state
          }
        });
      }
      
      // Check if we need to force an escape
      const directorCheck = aria.conversationDirector.assessConversation(
        conversationHistory,  // Use conversationHistory instead of messages
        user,
        conversationHistory.length
      );

      if (directorCheck.isStuck || directorCheck.shouldEscalate) {
        // Check last AI message to prevent loops
        const lastAIMessage = messages.slice().reverse().find(m => m.role === 'assistant');
        const isAlreadyEscape = lastAIMessage?.content?.includes('going in circles') ||
                               lastAIMessage?.content?.includes('Let me step back');

        if (!isAlreadyEscape) {
          const escapeMessage = aria.conversationDirector.generateEscapeMessage(
            directorCheck.stuckReason || 'repetition'
          );

          return res.json({
            choices: [{
              message: {
                role: 'assistant',
                content: escapeMessage
              }
            }],
            userInsights: generateUserInsights(analysis, updatedProfile, user, conversationHistory.length + 1)
          });
        }
        // If already sent escape, continue with normal flow
      }

      // Continue with normal generation but with mission guidance
      let adaptivePrompt = await aria.generateSystemPrompt(
        analysis,
        updatedProfile.personalityData,
        conversationHistory,
        user,
        coupleCompassState,
        gameState
      );

      // Prepare messages with natural conversation prompt
      const adaptiveMessages = [
        { role: 'system', content: adaptivePrompt },
        ...systemMessages,
        ...messages.slice(1) // Skip original system message
      ];

      // Call OpenAI with optimized settings
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: adaptiveMessages,
          max_tokens: 200, // Slightly more for personality
          temperature: 0.9, // Higher for more personality
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

      if (directorResults.currentGoal) {
        const insight = await extractMatchmakingInsights(
          latestUserMessage.content,
          data.choices[0].message.content,
          directorResults.currentGoal
        );
        if (insight) {
          await updateUserInsightMap(
            userId,
            directorResults.currentGoal,
            insight.value,
            insight.confidence,
            insight.evidence
          );
        }
      }
      
      // Generate report if ready
      let reportGenerated = false;
      if (analysis.ready_for_report?.ready && !user.report_generated) {
        const report = aria.reportGenerator.generateReport(
          user,
          updatedProfile.personalityData,
          updatedProfile.coupleCompassData
        );
        await savePersonalReport(userId, report);
        reportGenerated = true;
        console.log(`📝 Generated Your Story for ${user.user_name}`);
      }
      
      // Enhanced conversation summary
      const mbtiProgress = updatedProfile.personalityData.mbti_confidence_scores ? 
        Object.entries(updatedProfile.personalityData.mbti_confidence_scores)
          .map(([dim, score]) => `${dim}:${Math.round(score)}%`)
          .join(', ') : 'Building baseline';
      
      const sessionSummary = `Level ${analysis.should_level_up ? currentIntimacyLevel + 1 : currentIntimacyLevel}: ${analysis.topics.join(', ') || 'personal connection'} (${analysis.emotional_openness} openness, MBTI: ${mbtiProgress})`;
      
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
            mbti_fusion: analysis.mbti_analysis,
            values: analysis.family_values_hints
          },
          mbti_confidence_scores: updatedProfile.personalityData.mbti_confidence_scores,
          couple_compass_active: coupleCompassState?.active || false,
          couple_compass_complete: updatedProfile.personalityData.couple_compass_complete || false
        },
        sessionSummary
      );

      // Extract and store memories from this exchange
      const memories = await extractMemorableInformation(
        latestUserMessage.content,
        data.choices[0].message.content,
        `${analysis.current_topic || 'general conversation'}`
      );

      if (memories.length > 0) {
        await storeUserMemories(userId, memories, latestUserMessage.content);
      }

      // Return enhanced response - CRITICAL FIX: Always include game state
      res.json({
        ...data,
        userInsights: {
          ...generateUserInsights(analysis, updatedProfile, user, conversationHistory.length + 1),
          reportGenerated,
          reportAvailable: user.report_generated || reportGenerated,
          yourStoryReady: user.report_generated || reportGenerated,
          yourStoryNew: reportGenerated && !user.report_generated,
          coupleCompassResult: analysis.couple_compass_result,
          coupleCompassGameState: gameState || coupleCompassState
        }
      });

    } else {
      // Handle non-user messages
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: messages,
          max_tokens: 150,
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

// Helper function to generate user insights
function generateUserInsights(analysis, updatedProfile, user, conversationCount) {
  return {
    // Basic insights
    detectedMood: analysis.mood,
    detectedEnergy: analysis.energy,
    currentInterests: updatedProfile.personalityData.interests || [],
    communicationStyle: analysis.communication_style,
    emotionalNeeds: analysis.emotional_needs,
    conversationCount: conversationCount,
    isReturningUser: conversationCount > 1,
    userName: user.user_name,
    userGender: user.user_gender,
    
    // Memory and preferences
    userPreferences: updatedProfile.personalityData.user_preferences || {},
    
    // Conversation flow insights
    intimacyLevel: analysis.should_level_up ? 
      (updatedProfile.personalityData.conversation_flow?.current_intimacy_level || 0) : 
      (user.relationship_context?.intimacy_level || 0),
    emotionalOpenness: analysis.emotional_openness,
    storySharingLevel: analysis.story_sharing_level,
    intimacyProgression: analysis.should_level_up,
    celebrationMoment: analysis.celebration_opportunity,
    nextQuestionSuggestion: analysis.next_question_suggestion,
    
    // PRD features
    ariaPersonalityActive: true,
    coupleCompassReady: analysis.couple_compass_ready,
    reportReady: analysis.ready_for_report,
    
    // MBTI insights
    mbtiConfidenceScores: updatedProfile.personalityData.mbti_confidence_scores || {},
    mbtiAnalysis: analysis.mbti_analysis,
    dimensionsNeeded: analysis.mbti_needs?.dimensions_needed || [],
    priorityDimension: analysis.mbti_needs?.priority_dimension,
    
    // Resistance handling
    resistanceDetected: analysis.resistance_signals?.detected || false,
    resistanceHandled: analysis.resistance_signals?.detected ? 'Warm approach activated' : 'No resistance',
    
    // Topic management
    currentTopic: analysis.current_topic,
    topicDepth: analysis.topic_depth,
    shouldSwitchTopic: analysis.should_switch_topic,
    topicBridges: analysis.topic_bridges || [],
    
    // Advanced psychology
    advancedLoveLanguage: analysis.love_language_hints,
    advancedAttachment: analysis.attachment_hints,
    familyValues: analysis.family_values_hints,
    
    // Profile completeness
    profileCompleteness: calculateEnhancedProfileCompleteness(updatedProfile.personalityData),
    mbtiProgress: calculateMBTIProgress(updatedProfile.personalityData.mbti_confidence_scores || {}),
    readyForMatching: assessMatchingReadiness(updatedProfile.personalityData),
    
    // System quality
    conversationQuality: {
      naturalFlow: 'Active',
      personalityIntegration: 'Warm & Flirty',
      userComfort: analysis.resistance_signals?.detected ? 'Building Trust' : 'High',
      dataCollection: 'Natural & Effective',
      responseSpeed: 'Optimized',
      prdAlignment: 'Complete'
    }
  };
}

// Get user's story (personal report) - Enhanced with metadata
app.get('/api/user-report/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user details for the story
    const userResult = await pool.query(
      'SELECT user_name, user_gender, age, created_at FROM users WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get the report/story
    const result = await pool.query(
      'SELECT * FROM personal_reports WHERE user_id = $1 ORDER BY generated_at DESC LIMIT 1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Your Story is not ready yet. Keep chatting with Aria!' });
    }

    // Format the story sections for better display
    const reportContent = result.rows[0].report_content;
    const formattedSections = {};

    // Ensure all sections exist and format them
    Object.keys(reportContent.sections).forEach(key => {
      formattedSections[key] = reportContent.sections[key]
        .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove markdown bold
        .trim();
    });

    res.json({
      story: {
        title: `${userResult.rows[0].user_name}'s Story`,
        sections: formattedSections,
        metadata: {
          generatedAt: result.rows[0].generated_at,
          userName: userResult.rows[0].user_name,
          userGender: userResult.rows[0].user_gender,
          userAge: userResult.rows[0].age,
          memberSince: userResult.rows[0].created_at
        }
      },
      storyId: result.rows[0].id
    });

  } catch (error) {
    console.error('Error getting user story:', error);
    res.status(500).json({ error: 'Unable to load Your Story right now' });
  }
});

// Get user matches endpoint
app.get('/api/user-matches/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user profile
    const userResult = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    const aria = new AriaPersonality();
    
    // Find potential matches
    const potentialMatches = await findPotentialMatches(userId, user);
    
    // Calculate compatibility for each match
    const matchProfiles = [];
    
    for (const match of potentialMatches) {
      const compatibilityData = aria.compatibilityEngine.calculateCompatibility(
        {
          mbti_type: determineMBTIType(user.personality_data.mbti_confidence_scores || {}).partial_type,
          couple_compass: user.couple_compass_data,
          attachment_style: getPrimaryAttachment(user.personality_data.attachment_hints || []),
          interests: user.personality_data.interests || [],
          communication_style: user.personality_data.communication_patterns?.style,
          love_languages: user.personality_data.love_language_hints || []
        },
        {
          mbti_type: determineMBTIType(match.personality_data.mbti_confidence_scores || {}).partial_type,
          couple_compass: match.couple_compass_data,
          attachment_style: getPrimaryAttachment(match.personality_data.attachment_hints || []),
          interests: match.personality_data.interests || [],
          communication_style: match.personality_data.communication_patterns?.style,
          love_languages: match.personality_data.love_language_hints || []
        }
      );
      
      // Generate match profile
      const matchProfile = aria.matchGenerator.generateMatchProfile(user, match, compatibilityData);
      
      matchProfiles.push({
        matchId: match.user_id,
        matchName: match.user_name,
        compatibilityScore: compatibilityData.overallScore,
        profile: matchProfile
      });
      
      // Save match record
      await saveMatch(userId, match.user_id, compatibilityData);
    }
    
    // Sort by compatibility score
    matchProfiles.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
    
    res.json({
      matches: matchProfiles.slice(0, 3), // Top 3 matches
      totalFound: matchProfiles.length
    });
    
  } catch (error) {
    console.error('Error getting user matches:', error);
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
      coupleCompassData: userData.couple_compass_data,
      relationshipContext: userData.relationship_context,
      conversationCount: conversations.length,
      totalConversations: userData.total_conversations,
      recentTopics: conversations.slice(-3).map(conv => conv.session_summary),
      profileCompleteness: calculateEnhancedProfileCompleteness(userData.personality_data),
      reportGenerated: userData.report_generated,
      yourStoryAvailable: userData.report_generated || false,
      yourStoryGeneratedAt: userData.report_generated ? userData.created_at : null,
      
      // PRD-specific insights
      mbtiProgress: calculateMBTIProgress(userData.personality_data?.mbti_confidence_scores || {}),
      mbtiType: determineMBTIType(userData.personality_data?.mbti_confidence_scores || {}),
      readyForMatching: assessMatchingReadiness(userData.personality_data || {}),
      coupleCompassComplete: userData.personality_data?.couple_compass_complete || false,
      loveLanguages: userData.personality_data?.love_language_hints || [],
      attachmentStyle: getPrimaryAttachment(userData.personality_data?.attachment_hints || []),
      
      conversationSystem: {
        active: true,
        personality: 'Warm, Flirty, Caring',
        qualityScore: userData.personality_data?.conversation_flow?.emotional_openness || 'unknown',
        resistanceLevel: userData.personality_data?.resistance_count || 0,
        celebrationMoments: userData.personality_data?.conversation_flow?.last_celebration ? 1 : 0
      }
    });
  } catch (error) {
    console.error('Error getting user insights:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user matchmaking progress and readiness
app.get('/api/user-progress/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const insightResult = await pool.query(
      'SELECT * FROM user_insight_map WHERE user_id = $1',
      [userId]
    );

    if (insightResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const insightMap = insightResult.rows[0];
    const planner = new MatchmakerPlanner();
    const progress = planner.analyzeUserProgress(insightMap);

    const userResult = await pool.query(
      'SELECT personality_data FROM users WHERE user_id = $1',
      [userId]
    );
    const personalityData = userResult.rows[0]?.personality_data || {};
    const readiness = assessMatchingReadiness(personalityData);

    res.json({
      userId,
      progress,
      readiness
    });
  } catch (error) {
    console.error('Error getting user progress:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test life stage logic
app.get('/api/test-life-stage/:age', async (req, res) => {
  const age = parseInt(req.params.age);
  const lifeStage = LifeStageManager.getLifeStage(age);
  const compatibleStages = LifeStageManager.getCompatibleStages(lifeStage);

  res.json({
    age,
    lifeStage,
    lifeStageLabel: LifeStageManager.getLifeStageLabel(lifeStage),
    lifeStageEmoji: LifeStageManager.getLifeStageEmoji(lifeStage),
    compatibleStages,
    compatibleStagesLabels: compatibleStages.map(s => LifeStageManager.getLifeStageLabel(s))
  });
});

// Check current database schema
app.get('/api/admin/check-life-stage-setup/:adminKey', async (req, res) => {
  try {
    const { adminKey } = req.params;

    if (adminKey !== 'soulsync_admin_2025') {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const columnsResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns
      WHERE table_name = 'users' 
      AND column_name IN ('life_stage', 'life_stage_flexibility', 'age')
    `);

    const distributionResult = await pool.query(`
      SELECT life_stage, COUNT(*) as count 
      FROM users 
      WHERE life_stage IS NOT NULL 
      GROUP BY life_stage 
      ORDER BY life_stage
    `);

    const sampleUsers = await pool.query(`
      SELECT user_name, age, life_stage 
      FROM users 
      WHERE age IS NOT NULL 
      LIMIT 5
    `);

    res.json({
      columnsExist: {
        age: columnsResult.rows.some(r => r.column_name === 'age'),
        life_stage: columnsResult.rows.some(r => r.column_name === 'life_stage'),
        life_stage_flexibility: columnsResult.rows.some(r => r.column_name === 'life_stage_flexibility')
      },
      lifeStageDistribution: distributionResult.rows,
      sampleUsers: sampleUsers.rows,
      setupComplete: columnsResult.rows.length === 3
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test love language compatibility
app.get('/api/test-love-language-match', async (req, res) => {
  const testCases = [
    {
      name: "Partial Match",
      user1: { attachment: 'secure', languages: ['quality_time', 'physical_touch'] },
      user2: { attachment: 'secure', languages: ['quality_time', 'words_of_affirmation'] }
    },
    {
      name: "No Match",
      user1: { attachment: 'secure', languages: ['acts_of_service'] },
      user2: { attachment: 'anxious', languages: ['gifts', 'words_of_affirmation'] }
    },
    {
      name: "Perfect Match",
      user1: { attachment: 'secure', languages: ['quality_time', 'physical_touch'] },
      user2: { attachment: 'secure', languages: ['quality_time', 'physical_touch'] }
    }
  ];

  const engine = new CompatibilityEngine();
  const results = testCases.map(test => ({
    scenario: test.name,
    emotionalScore: engine.calculateEmotionalFit(
      test.user1.attachment,
      test.user2.attachment,
      test.user1.languages,
      test.user2.languages
    ),
    breakdown: {
      attachment: `${test.user1.attachment} + ${test.user2.attachment}`,
      sharedLanguages: test.user1.languages.filter(l => test.user2.languages.includes(l))
    }
  }));

  res.json({
    testResults: results,
    explanation: "Emotional score = 60% attachment + 40% love language compatibility"
  });
});

// Helper function to get primary attachment style
function getPrimaryAttachment(hints) {
  if (hints.includes('secure_tendency')) return 'secure';
  if (hints.includes('anxious_tendency')) return 'anxious';
  if (hints.includes('avoidant_tendency')) return 'avoidant';
  return 'developing';
}

// Enhanced profile completeness calculation
function calculateEnhancedProfileCompleteness(personalityData) {
  const phases = {
    // Phase 1: Basic personality (10% weight)
    basic: ['interests', 'communication_patterns', 'emotional_patterns'],
    
    // Phase 2: MBTI framework (30% weight)
    mbti: ['mbti_confidence_scores'],
    
    // Phase 3: Couple Compass (30% weight)
    couple_compass: ['couple_compass_complete'],
    
    // Phase 4: Advanced psychology (20% weight)
    advanced_psychology: ['love_language_hints', 'attachment_hints'],
    
    // Phase 5: Values and lifestyle (10% weight)
    values: ['family_values_hints']
  };
  
  const weights = {
    basic: 0.10,
    mbti: 0.30,
    couple_compass: 0.30,
    advanced_psychology: 0.20,
    values: 0.10
  };
  
  let totalScore = 0;
  
  Object.entries(phases).forEach(([phase, fields]) => {
    let phaseScore = 0;
    
    if (phase === 'mbti') {
      const mbtiScores = personalityData.mbti_confidence_scores || {};
      const avgConfidence = Object.values(mbtiScores).reduce((sum, score) => sum + score, 0) / 4;
      phaseScore = Math.min(avgConfidence / 100, 1);
    } else if (phase === 'couple_compass') {
      phaseScore = personalityData.couple_compass_complete ? 1 : 0;
    } else {
      const phaseFields = fields.filter(field => {
        const data = personalityData[field];
        if (Array.isArray(data)) return data.length > 0;
        if (typeof data === 'object') return Object.keys(data || {}).length > 0;
        return !!data;
      });
      phaseScore = phaseFields.length / fields.length;
    }
    
    totalScore += phaseScore * weights[phase];
  });
  
  return Math.round(totalScore * 100);
}

// Calculate MBTI discovery progress
function calculateMBTIProgress(mbtiScores) {
  const dimensionProgress = {
    E_I: Math.round(mbtiScores.E_I || 0),
    S_N: Math.round(mbtiScores.S_N || 0),
    T_F: Math.round(mbtiScores.T_F || 0),
    J_P: Math.round(mbtiScores.J_P || 0)
  };
  
  const avgProgress = Object.values(dimensionProgress).reduce((sum, score) => sum + score, 0) / 4;
  const dimensionsAbove75 = Object.values(dimensionProgress).filter(score => score >= 75).length;
  
  return {
    individual_dimensions: dimensionProgress,
    average_confidence: Math.round(avgProgress),
    dimensions_discovered: dimensionsAbove75,
    total_dimensions: 4,
    discovery_percentage: Math.round((dimensionsAbove75 / 4) * 100),
    detection_method: 'Natural Conversation with Aria'
  };
}

// Determine MBTI type from confidence scores
function determineMBTIType(mbtiScores) {
  const type = {
    determined: false,
    partial_type: '',
    confidence_level: 'low',
    type_letters: {},
    detection_quality: 'natural_conversation'
  };
  
  // Determine each dimension based on confidence threshold
  if (mbtiScores.E_I >= 75) {
    type.type_letters.energy = 'E';
  } else if (mbtiScores.E_I <= 25) {
    type.type_letters.energy = 'I';
  }
  
  if (mbtiScores.S_N >= 75) {
    type.type_letters.information = 'S';
  } else if (mbtiScores.S_N <= 25) {
    type.type_letters.information = 'N';
  }
  
  if (mbtiScores.T_F >= 75) {
    type.type_letters.decisions = 'T';
  } else if (mbtiScores.T_F <= 25) {
    type.type_letters.decisions = 'F';
  }
  
  if (mbtiScores.J_P >= 75) {
    type.type_letters.lifestyle = 'J';
  } else if (mbtiScores.J_P <= 25) {
    type.type_letters.lifestyle = 'P';
  }
  
  // Calculate partial type and confidence
  const determinedLetters = Object.values(type.type_letters).length;
  
  if (determinedLetters === 4) {
    type.partial_type = `${type.type_letters.energy}${type.type_letters.information}${type.type_letters.decisions}${type.type_letters.lifestyle}`;
    type.determined = true;
    type.confidence_level = 'high';
  } else if (determinedLetters >= 2) {
    type.partial_type = `${type.type_letters.energy || '_'}${type.type_letters.information || '_'}${type.type_letters.decisions || '_'}${type.type_letters.lifestyle || '_'}`;
    type.confidence_level = 'medium';
  } else if (determinedLetters >= 1) {
    type.partial_type = 'Some preferences identified';
    type.confidence_level = 'low';
  }
  
  return type;
}

// Assess readiness for matchmaking
function assessMatchingReadiness(personalityData) {
  const criteria = {
    mbti_completion: 0,
    couple_compass_completion: 0,
    love_language_clarity: 0,
    attachment_understanding: 0,
    values_exploration: 0,
    overall_readiness: 0
  };
  
  // MBTI completion (30% weight)
  const mbtiScores = personalityData.mbti_confidence_scores || {};
  const avgMBTI = Object.values(mbtiScores).reduce((sum, score) => sum + score, 0) / 4;
  criteria.mbti_completion = Math.round(avgMBTI);
  
  // Couple Compass completion (30% weight)
  criteria.couple_compass_completion = personalityData.couple_compass_complete ? 100 : 0;
  
  // Love language clarity (15% weight)
  const loveLanguages = personalityData.love_language_hints || [];
  criteria.love_language_clarity = Math.min(loveLanguages.length * 25, 100);
  
  // Attachment understanding (15% weight)
  const attachmentHints = personalityData.attachment_hints || [];
  criteria.attachment_understanding = Math.min(attachmentHints.length * 33, 100);
  
  // Values exploration (10% weight)
  const valuesHints = personalityData.family_values_hints || [];
  criteria.values_exploration = Math.min(valuesHints.length * 50, 100);
  
  // Calculate overall readiness
  criteria.overall_readiness = Math.round(
    (criteria.mbti_completion * 0.30) +
    (criteria.couple_compass_completion * 0.30) +
    (criteria.love_language_clarity * 0.15) +
    (criteria.attachment_understanding * 0.15) +
    (criteria.values_exploration * 0.10)
  );
  
  return {
    ...criteria,
    ready_for_matching: criteria.overall_readiness >= 75,
    readiness_level: criteria.overall_readiness >= 75 ? 'ready' : 
                    criteria.overall_readiness >= 50 ? 'almost_ready' : 'building_profile',
    detection_method: 'Aria Conversation + Couple Compass'
  };
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
        'Complete user profiles with PRD structure',
        'Phone number allowlist system (35 users max)',
        'Aria personality system (warm, flirty, caring)',
        'Couple Compass game implementation',
        'Personal insight report generation',
        'Basic matchmaking engine',
        'Cross-session memory with personality tracking'
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

// Enhanced health check with complete PRD implementation
app.get('/api/health', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT NOW()');
    const allowlistCount = await pool.query('SELECT COUNT(*) FROM phone_allowlist WHERE status = $1', ['active']);
    
    res.json({ 
      status: 'SoulSync AI - PRD COMPLETE IMPLEMENTATION ✅',
      tagline: 'Emotionally intelligent matchmaking + relationship readiness',
      
      prd_features_implemented: {
        '🎭 AI Companion': 'Aria - warm, flirty, caring personality',
        '💬 Natural Chat': '2-3 sentence responses with personal sharing',
        '🧭 Couple Compass': 'Multiple-choice life alignment game',
        '📊 MBTI Detection': 'Natural conversation-based discovery',
        '💕 Love Languages': 'Behavioral scenario detection',
        '🔗 Attachment Styles': 'Conflict and emotional pattern analysis',
        '📝 Personal Reports': 'Narrative insight generation',
        '💑 Basic Matching': 'Multi-dimensional compatibility scoring'
      },
      
      database_connected: true,
      database_time: dbTest.rows[0].now,
      allowlist_users: allowlistCount.rows[0].count,
      allowlist_capacity: '35 users max',
      
      implementation_phases: {
        'Phase 1': '✅ Aria Personality - Warm, flirty companion',
        'Phase 2': '✅ Couple Compass - Life vision alignment game',
        'Phase 3': '✅ Enhanced Data Structure - Complete profile system',
        'Phase 4': '✅ Report Generation - Personal insights',
        'Phase 5': '✅ Basic Matchmaking - Compatibility engine',
        'Phase 6': '✅ Life Stage Matching - Age-based compatibility'
      },
      
      conversation_features: [
        'Flirtatious but respectful personality',
        'Personal story sharing ("filter coffee and internal conflict")',
        'Emotional reactions and observations',
        'Natural MBTI detection through conversation',
        'Progressive intimacy levels (0-4)',
        'Resistance handling with warmth',
        'Celebration of user insights',
        'Off-topic graceful redirects'
      ],
      
      couple_compass_features: [
        'Living arrangements exploration',
        'Financial partnership styles',
        'Parenting vision alignment',
        'Conflict resolution preferences',
        'Career vs life balance',
        'Synthesis and insights'
      ],
      
      ai_capabilities: {
        personality: 'Aria embodies warmth, curiosity, and genuine care',
        conversation_style: 'Natural flow with strategic psychology',
        data_collection: 'Invisible through genuine connection',
        user_experience: 'Feels like talking to a best friend',
        matchmaking_approach: 'Multi-dimensional compatibility analysis'
      }
    });
  } catch (error) {
    res.json({ 
      status: 'Backend running, database connection issue',
      database_connected: false,
      database_error: error.message,
      features: [
        'In-memory storage (fallback)',
        'Aria personality active',
        'Natural conversation flow',
        'PRD vision implemented'
      ]
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`💕 SoulSync AI - PRD COMPLETE IMPLEMENTATION`);
  console.log('🎭 Aria Personality: Warm, flirty, caring AI companion');
  console.log('💬 Natural Chat: 2-3 sentences with personal sharing');
  console.log('🧭 Couple Compass: Life alignment through playful game');
  console.log('📊 MBTI Detection: Natural discovery through conversation');
  console.log('📝 Reports: Personal insights like letter from therapist + lover');
  console.log('💑 Matchmaking: Multi-dimensional compatibility analysis');
  console.log('✨ Experience: "Every question feels like curiosity, not interrogation"');
  console.log(`🚀 Running on port ${PORT} - Ready to create meaningful connections!`);
});
