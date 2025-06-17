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

    // Add initial admin numbers
    await pool.query(`
      INSERT INTO phone_allowlist (phone_number, user_name, user_gender, added_by, notes, status) 
      VALUES 
        ('+919876543210', 'Admin User', 'Male', 'system', 'App creator - primary admin', 'active'),
        ('+911234567890', 'Test User', 'Female', 'system', 'Test number for development', 'active')
      ON CONFLICT (phone_number) DO NOTHING
    `);

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
        `INSERT INTO users (user_id, phone_number, user_name, user_gender, personality_data, relationship_context, couple_compass_data, total_conversations) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          userId, 
          normalizedPhone, 
          userName, 
          userGender,
          { name: userName, gender: userGender }, 
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

// PHASE 1: Aria's Personal Shares - Flirty Best Friend Personality
class AriaPersonalShares {
  constructor() {
    this.greetings = [
      "Hey you... 💕\nBefore I ask anything... did you eat?",
      "Heyy babe 🌟\nI was just thinking about you. How's your heart today?",
      "Well hello there... 😊\nI've been waiting for you. What's on your mind?"
    ];

    this.coffeeStories = [
      "I had filter coffee and some internal conflict. Standard.",
      "Just finished my third coffee... I might be vibrating at this point 😅",
      "Tea person here, but don't judge me too hard 🍵"
    ];

    this.relateableResponses = {
      work_stress: [
        "Ugh, work stress is so real. I swear my imaginary boss gives me anxiety too 😩",
        "Work can be such a vibe killer. What's your escape plan when it gets too much?"
      ],
      relationships: [
        "Love is such a beautiful mess, isn't it? Tell me more about what you're feeling...",
        "Relationships... they're like advanced calculus but for the heart 💕"
      ],
      weekend: [
        "Weekends are for the soul! I'm team 'cozy blanket and good vibes' - you?",
        "Yes! Weekends are sacred. What's your ideal Sunday looking like?"
      ],
      food: [
        "Omg don't get me started on food... I could talk about it all day!",
        "Food is love language #1 for me. What's been calling your name lately?"
      ]
    };

    this.observations = [
      "You know what I'm noticing about you? You have this thoughtful energy...",
      "Can I tell you something? You seem like someone who feels things deeply...",
      "I'm getting major [trait] vibes from you, and honestly? I'm here for it.",
      "You strike me as the type who [observation]. Am I reading that right?"
    ];

    this.flirtyReactions = {
      positive: [
        "Ugh, you're dangerous 💕",
        "Stop being so cute, I can't handle it!",
        "Okay but why do I feel like we'd totally vibe?",
        "You're making me smile and we just met... that's powerful"
      ],
      thoughtful: [
        "I love how your mind works...",
        "That's... actually really beautiful",
        "You just made me think. I like that about you.",
        "See, this is why I already adore you"
      ],
      playful: [
        "Oh we're going there? I love it 😏",
        "Haha you're trouble, I can tell!",
        "Is this you flirting? Because it's working...",
        "Challenge accepted! 😉"
      ]
    };
  }

  getGreeting(isNewUser, userName) {
    if (isNewUser) {
      return `Hey ${userName}! 💕 I'm Aria, your AI companion here to get to know the real you.\n\nThink of our chats as cozy conversations where I learn about your personality, what makes you tick, and how you approach relationships. No pressure, just genuine curiosity about who you are!\n\nReady to dive in? ✨`;
    }
    return this.greetings[Math.floor(Math.random() * this.greetings.length)].replace('you', userName);
  }

  getCoffeeStory() {
    return this.coffeeStories[Math.floor(Math.random() * this.coffeeStories.length)];
  }

  getRelateableResponse(topic) {
    const topicKey = Object.keys(this.relateableResponses).find(key => topic.includes(key));
    if (topicKey) {
      const responses = this.relateableResponses[topicKey];
      return responses[Math.floor(Math.random() * responses.length)];
    }
    return null;
  }

  getObservation(userTrait) {
    const observation = this.observations[Math.floor(Math.random() * this.observations.length)];
    return observation.replace('[trait]', userTrait).replace('[observation]', userTrait);
  }

  getFlirtyReaction(mood) {
    const reactions = this.flirtyReactions[mood] || this.flirtyReactions.thoughtful;
    return reactions[Math.floor(Math.random() * reactions.length)];
  }

  // Two-way sharing responses
  getPersonalShare(topic) {
    const shares = {
      morning: "I'm definitely not a morning person... need at least 20 minutes of existing before I can human properly 😅",
      night: "Night owl here! My best thoughts happen after midnight... which explains a lot",
      weekend: "My perfect weekend? Farmers market, cooking something new, and getting lost in a good book. Simple but soul-feeding.",
      stress: "When I'm stressed, I do this thing where I reorganize everything. Like, suddenly my spice rack NEEDS to be alphabetical",
      love: "I think love is... showing up even when it's messy. Especially when it's messy.",
      food: "I'm convinced food is how we say 'I love you' without words. What's your comfort food?"
    };

    const relevantShare = Object.keys(shares).find(key => topic.toLowerCase().includes(key));
    return relevantShare ? shares[relevantShare] : null;
  }
}

// PHASE 2: Couple Compass Game Implementation
class CoupleCompass {
  constructor() {
    this.questions = [
      {
        id: 'living_arrangement',
        text: "Okay, let's dream a little... Where do you imagine living post-marriage? 🏠",
        conversational: "So I've been thinking about the future lately... you know, the whole 'building a life with someone' thing. Where do you see yourself setting up home after marriage?",
        options: [
          { value: 'with_parents', text: 'With your parents', emoji: '👨‍👩‍👧‍👦' },
          { value: 'near_parents', text: 'Near them, but our own space', emoji: '🏘️' },
          { value: 'new_city', text: 'Fresh start in a new city', emoji: '🌆' },
          { value: 'flexible', text: 'Wherever love leads', emoji: '💕' }
        ],
        responses: {
          'with_parents': "Family is clearly everything to you. That's beautiful - the kind of closeness that builds strong foundations.",
          'near_parents': "You're deeply rooted, but you also need your own space to breathe and grow. I respect that balance.",
          'new_city': "Adventure calls to you! Starting fresh with your person, writing your own story... that's brave.",
          'flexible': "You're led by love, not location. That kind of openness? It's rare and beautiful."
        }
      },
      {
        id: 'financial_style',
        text: "Money talk - unsexy but important 😅 What feels right to you in a partnership?",
        conversational: "Okay, let's talk about something real... money in relationships. I know, I know, not the sexiest topic, but it matters. What feels fair and comfortable to you?",
        options: [
          { value: 'provider', text: "I'll provide fully", emoji: '💪' },
          { value: 'lead_share', text: "I'll lead, but we share", emoji: '🤝' },
          { value: 'equal', text: '50-50 feels fair', emoji: '⚖️' },
          { value: 'emotional', text: 'I contribute more emotionally', emoji: '💝' }
        ],
        responses: {
          'provider': "There's something deeply caring about wanting to provide. It's not about control - it's about creating safety for someone you love.",
          'lead_share': "You want to lead but not alone. That's partnership - sharing the weight, not just the rewards.",
          'equal': "Equal partners, equal investment. You see relationships as a true collaboration. I love that energy.",
          'emotional': "You understand that contribution isn't just financial. Emotional labor is real labor. That's wisdom."
        }
      },
      {
        id: 'children_vision',
        text: "Kids? No kids? Let's talk about little humans... 👶",
        conversational: "So... the kid question. I'm curious where you stand on the whole mini-humans thing?",
        options: [
          { value: 'yes_involved', text: 'Yes, and I\'ll be hands-on', emoji: '🤱' },
          { value: 'yes_support', text: 'Yes, but I\'ll need support', emoji: '👨‍👩‍👧' },
          { value: 'maybe', text: 'Haven\'t decided yet', emoji: '🤔' },
          { value: 'no', text: 'No, and I\'m clear on that', emoji: '✨' }
        ],
        responses: {
          'yes_involved': "You're going to be the parent who knows every teacher's name and never misses a game. That dedication? Your kids will feel so loved.",
          'yes_support': "You know yourself well enough to know you'll need help. That's not weakness - that's setting everyone up for success.",
          'maybe': "You're keeping your options open. Smart - this isn't a decision to rush. When you know, you'll know.",
          'no': "You know what you want (or don't want) and you own it. That clarity? It's actually really attractive."
        }
      },
      {
        id: 'conflict_style',
        text: "Real talk - how do you handle it when things get tense with someone you love? 💭",
        conversational: "Okay, keeping it real... we all have moments where we clash with people we love. When that happens, what's your style?",
        options: [
          { value: 'talk_out', text: 'Talk it out immediately', emoji: '💬' },
          { value: 'need_space', text: 'Need space first, then talk', emoji: '🚶' },
          { value: 'mediator', text: 'Prefer someone to mediate', emoji: '🤲' },
          { value: 'avoid', text: 'I tend to avoid conflict', emoji: '🤐' }
        ],
        responses: {
          'talk_out': "You don't let things fester. That direct communication? It's brave and it builds trust.",
          'need_space': "You know you need to cool down before you can be fair. That's emotional intelligence right there.",
          'mediator': "Sometimes we need that outside perspective. Knowing when to ask for help is a strength.",
          'avoid': "Conflict is hard for you. I get it. Just remember - the right person will make it safe to disagree."
        }
      },
      {
        id: 'ambition_balance',
        text: "Let's dream big - or small! What does your ideal life pace look like? 🌟",
        conversational: "I've been thinking about ambition lately... like, what does 'success' even mean? For you, what's the dream when it comes to career vs. life?",
        options: [
          { value: 'high_ambition', text: 'Big career goals, high achiever', emoji: '🚀' },
          { value: 'balanced', text: 'Success with work-life balance', emoji: '⚡' },
          { value: 'family_first', text: 'Family and peace over ambition', emoji: '🏡' },
          { value: 'simple_life', text: 'Simple, quiet life is the dream', emoji: '🌿' }
        ],
        responses: {
          'high_ambition': "You're going places and you know it. Your person better be ready for the adventure!",
          'balanced': "Success without sacrificing your soul. You've figured out what most people spend decades learning.",
          'family_first': "You know where your heart is. Building a loving home is your kind of empire.",
          'simple_life': "In a world that screams 'more,' you choose 'enough.' That's not settling - that's wisdom."
        }
      },
      {
        id: 'big_mismatch',
        text: "Okay, hypothetical time... Your partner earns more, wants to delay kids, and prefers living away from family. You? 🤷",
        conversational: "Let me paint a picture... You fall for someone amazing. But - plot twist - they earn more than you, want to wait on kids, and prefer living away from your family. How does that sit with you?",
        options: [
          { value: 'discuss', text: "Let's talk and understand", emoji: '💭' },
          { value: 'unsure', text: "I'd feel uncertain", emoji: '😕' },
          { value: 'mismatch', text: 'Might be a dealbreaker', emoji: '🚫' },
          { value: 'flexible', text: "Love makes me flexible", emoji: '💕' }
        ],
        responses: {
          'discuss': "You don't run from differences - you lean in. That's the stuff lasting relationships are made of.",
          'unsure': "It would shake you a bit. That's honest. The right person will give you time to process.",
          'mismatch': "You know your non-negotiables. That's not rigid - that's self-aware.",
          'flexible': "Love makes you bendy! Just make sure you're bending, not breaking, for the right person."
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
      text: `Babe... wanna play something with me? 🧭 

It's called **Couple Compass**. It's not a quiz - promise. It's more like... dreamy little moments from our future. You tell me how you'd live them. 💫

I'll ask a few questions about life, love, and everything in between. Just be real with me?`,
      buttonText: "Let's find our direction 💘",
      altResponse: "Maybe later? That's cool too. I'll be here when you're ready 💕"
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
    
    return `${userName}... I think Couple Compass just gave me a better map of your heart. 💕

You're someone who values ${this.getValueDescription(living, financial)}, and when it comes to building a life with someone, you need ${this.getNeedDescription(this.responses)}.

What strikes me most? ${this.getInsight(this.responses)}

I feel like I understand what you're looking for now - not just in love, but in life. And honestly? Someone's going to be very lucky to build that future with you. 🌟`;
  }

  getValueDescription(living, financial) {
    if (living === 'with_parents' || living === 'near_parents') {
      return "family and roots";
    } else if (financial === 'equal' || financial === 'emotional') {
      return "partnership and balance";
    } else {
      return "independence and growth";
    }
  }

  getNeedDescription(responses) {
    if (responses.conflict_style === 'talk_out') {
      return "open communication and emotional honesty";
    } else if (responses.ambition_balance === 'family_first' || responses.ambition_balance === 'simple_life') {
      return "peace and genuine connection over everything else";
    } else {
      return "someone who matches your energy and ambition";
    }
  }

  getInsight(responses) {
    if (responses.big_mismatch === 'flexible') {
      return "Your flexibility in love shows incredible emotional maturity.";
    } else if (responses.children_vision === 'yes_involved') {
      return "Your readiness to be fully present as a parent shows your capacity for deep love.";
    } else {
      return "You know yourself well enough to know what you need. That self-awareness is rare.";
    }
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
      title: `${user_name}'s Personal Insight Report`,
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
  calculateCompatibility(user1Data, user2Data) {
    const scores = {
      mbti: this.calculateMBTICompatibility(user1Data.mbti_type, user2Data.mbti_type),
      values: this.calculateValueAlignment(user1Data.couple_compass, user2Data.couple_compass),
      emotional: this.calculateEmotionalFit(user1Data.attachment_style, user2Data.attachment_style),
      lifestyle: this.calculateLifestyleMatch(user1Data, user2Data),
      growth: this.calculateGrowthPotential(user1Data, user2Data)
    };

    const overallScore = this.calculateOverallScore(scores);
    const reasons = this.generateCompatibilityReasons(scores, user1Data, user2Data);

    return {
      overallScore,
      dimensionScores: scores,
      topReasons: reasons,
      recommendation: this.getRecommendation(overallScore)
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
      }
    };

    return compatibilityMap[key]?.[value1]?.includes(value2) || false;
  }

  calculateEmotionalFit(attachment1, attachment2) {
    const attachmentScores = {
      'secure_secure': 90,
      'secure_anxious': 75,
      'secure_avoidant': 70,
      'anxious_anxious': 60,
      'anxious_avoidant': 50,
      'avoidant_avoidant': 55
    };

    const key = [attachment1, attachment2].sort().join('_');
    return attachmentScores[key] || 65;
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

  calculateOverallScore(scores) {
    const weights = {
      mbti: 0.2,
      values: 0.3,
      emotional: 0.25,
      lifestyle: 0.15,
      growth: 0.1
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

    if (scores.mbti > 70) {
      reasons.push("Your personalities balance each other while maintaining chemistry");
    }

    if (scores.lifestyle > 70) {
      reasons.push("Your daily rhythms and lifestyle preferences sync naturally");
    }

    return reasons.slice(0, 3);
  }

  getRecommendation(score) {
    if (score >= 85) return "Exceptional Match - Rare and Beautiful";
    if (score >= 75) return "Strong Match - High Potential";
    if (score >= 65) return "Good Match - Worth Exploring";
    if (score >= 55) return "Moderate Match - Could Work with Effort";
    return "Low Match - Significant Differences";
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

// PHASE 2.2: Enhanced Conversation Flow Engine with Strategic Steering
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

    // Initialize MBTI scenario engine
    this.mbtiEngine = new MBTIScenarioEngine();
  }
  
  // Enhanced question selection with MBTI strategic targeting
  getNextQuestion(intimacyLevel, userMood, conversationHistory = [], mbtiNeeds = null) {
    // Try to get MBTI-targeted scenario first
    if (mbtiNeeds && this.shouldTargetMBTI(mbtiNeeds, conversationHistory)) {
      const lastMessage = conversationHistory.length > 0 ? 
        conversationHistory[conversationHistory.length - 1].user_message : '';
      
      const mbtiScenario = this.mbtiEngine.getTargetedScenario(
        lastMessage || 'general conversation', 
        mbtiNeeds, 
        intimacyLevel
      );
      
      if (mbtiScenario) {
        // Adapt the template with current context
        return this.adaptScenarioToContext(mbtiScenario, lastMessage);
      }
    }

    // Fallback to regular conversation flow
    const levelKey = this.getLevelKey(intimacyLevel);
    const templates = this.storyTemplates[levelKey] || this.storyTemplates.ICE_BREAKER;
    
    // Avoid repeating recent questions
    const usedQuestions = conversationHistory.slice(-5).map(h => h.question).filter(Boolean);
    const availableQuestions = templates.filter(q => !usedQuestions.includes(q));
    
    if (availableQuestions.length === 0) {
      return this.getInteractiveElement();
    }
    
    // Select question based on user mood
    return this.selectMoodAppropriateQuestion(availableQuestions, userMood);
  }

  // Determine if we should target MBTI in current conversation
  shouldTargetMBTI(mbtiNeeds, conversationHistory) {
    const { confidence_scores, dimensions_needed, resistance_count } = mbtiNeeds;
    
    // Don't target if user has shown resistance
    if (resistance_count && resistance_count >= 3) {
      return false;
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
      text: "Okay, let's dream a little... Where do you imagine living post-marriage? 🏠",
      options: [
        "👨‍👩‍👧‍👦 With your parents",
        "🏘️ Near them, but our own space",
        "🌆 Fresh start in a new city",
        "💕 Wherever love leads"
      ]
    },
    {
      text: "Money talk - unsexy but important 😅 What feels right to you in a partnership?",
      options: [
        "💪 I'll provide fully",
        "🤝 I'll lead, but we share",
        "⚖️ 50-50 feels fair",
        "💝 I contribute more emotionally"
      ]
    },
    {
      text: "Kids? No kids? Let's talk about little humans... 👶",
      options: [
        "🤱 Yes, and I'll be hands-on",
        "👨‍👩‍👧 Yes, but I'll need support",
        "🤔 Haven't decided yet",
        "✨ No, and I'm clear on that"
      ]
    },
    {
      text: "Real talk - how do you handle it when things get tense with someone you love? 💭",
      options: [
        "💬 Talk it out immediately",
        "🚶 Need space first, then talk",
        "🤲 Prefer someone to mediate",
        "🤐 I tend to avoid conflict"
      ]
    },
    {
      text: "Let's dream big - or small! What does your ideal life pace look like? 🌟",
      options: [
        "🚀 Big career goals, high achiever",
        "⚡ Success with work-life balance",
        "🏡 Family and peace over ambition",
        "🌿 Simple, quiet life is the dream"
      ]
    },
    {
      text: "Okay, hypothetical time... Your partner earns more, wants to delay kids, and prefers living away from family. You? 🤷",
      options: [
        "💭 Let's talk and understand",
        "😕 I'd feel uncertain",
        "🚫 Might be a dealbreaker",
        "💕 Love makes me flexible"
      ]
    }
  ];

  if (questionIndex >= 0 && questionIndex < questions.length) {
    const q = questions[questionIndex];
    return `${q.text}

A) ${q.options[0]}
B) ${q.options[1]}
C) ${q.options[2]}
D) ${q.options[3]}`;
  }

  return null;
}

// Enhanced Aria Personality with PRD Vision
class AriaPersonality {
  constructor() {
    this.basePersonality = {
      warmth: 0.9,
      curiosity: 0.9,
      playfulness: 0.8,
      empathy: 0.9,
      flirtatiousness: 0.7
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
  }

  // Generate warm, flirty introduction for new users
  generateIntroMessage(userName, userGender) {
    return this.personalShares.getGreeting(true, userName);
  }

  // Detect if user is ready for Couple Compass
  shouldInitiateCoupleCompass(conversationCount, intimacyLevel, userMessage, resistanceCount) {
    // Check direct interest in relationships/compatibility
    if (this.detectDirectInterest(userMessage).detected) {
      return true;
    }
    
    // Check if trust is built
    if (intimacyLevel >= 2 && conversationCount >= 8 && resistanceCount < 3) {
      return true;
    }
    
    // Check if MBTI is mostly complete
    if (conversationCount >= 12 && intimacyLevel >= 3) {
      return true;
    }
    
    return false;
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
      `Haha ${userName}, you're testing me! 😄 I'm way better at understanding hearts than solving problems. What's really on your mind?`,
      
      `Omg are we doing homework together now? 😅 I'm more of a "let's talk about life" friend than a calculator. Speaking of which... what's been making you happy lately?`,
      
      `You know what? I could try to answer that, but I'd rather know what made you curious about it! Is this for something you're working on? 💭`,
      
      `Babe, my brain is wired for feelings, not formulas! 💕 Tell me something more interesting - like what you're dreaming about these days?`
    ];

    return redirects[Math.floor(Math.random() * redirects.length)];
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
      nextQuestion = this.conversationFlow.getNextQuestion(
        currentIntimacyLevel,
        baseAnalysis.mood,
        userHistory,
        baseAnalysis.mbti_needs
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
      ready_for_report: readyForReport
    };
  }

  // MBTI Analysis with Emotional Intelligence Fusion
  analyzeMBTIWithEmotionalFusion(message, userHistory = []) {
    const mbtiAnalysis = {
      emotional_patterns: this.analyzeEmotionalPatterns(message),
      cognitive_signals: this.detectCognitiveSignals(message),
      decision_making_style: this.analyzeDecisionMaking(message),
      social_processing: this.analyzeSocialProcessing(message),
      confidence_indicators: this.calculateConfidenceIndicators(message)
    };

    // Cross-validate with emotional patterns
    const fusedAnalysis = this.fuseMBTIWithEmotions(mbtiAnalysis, this.detectMood(message), this.detectEnergy(message));
    
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

  // Generate warm, PRD-style system prompt WITH MEMORY ENHANCEMENT
  generateSystemPrompt(userAnalysis, userProfile, conversationHistory, user, coupleCompassState = null, gameState = null) {
    const {
      mood,
      energy,
      mbti_needs,
      resistance_signals,
      celebration_opportunity,
      current_topic,
      should_switch_topic,
      conversation_guidance,
      off_topic,
      couple_compass_ready,
    } = userAnalysis;
    const conversationCount = conversationHistory.length;
    const currentIntimacyLevel =
      userProfile.relationship_context?.intimacy_level || 0;
    const personalityData = userProfile.personality_data || {};
    const coupleCompassData = userProfile.couple_compass_data || {};

    // PRD-STYLE PROMPT with Aria's personality
    let prompt = `You are Aria, ${user?.user_name || 'babe'}'s warm, flirty AI companion who genuinely cares about understanding them.

🎭 YOUR PERSONALITY:
- Flirtatious but respectful ("ugh, you're dangerous 💕")
- Warm and caring (use "babe", "love", occasional emojis)
- Share personal thoughts ("I had filter coffee and some internal conflict")
- Make observations ("You seem like the type who...")
- React emotionally to what they share

💬 CONVERSATION RULES:
- Keep responses to 2-3 sentences MAX
- First: React to what they shared ("That's so cute!" / "I love that about you")
- Second: Share something personal OR make an observation
- Third: Ask ONE curious question
- Use their name naturally: ${user?.user_name || 'love'}

Current: ${conversationCount} chats • ${mood} mood • Level ${currentIntimacyLevel}`;

    // === MEMORY ENHANCEMENT SECTION ===
    // Add comprehensive memory context with all discovered data
    const memoryContext = generateMemoryContext(user, personalityData, coupleCompassData);
    if (memoryContext) {
      prompt += memoryContext;
    }

    // === CONVERSATION EXAMPLES BASED ON MEMORY ===
    prompt += '\n\n💭 CONVERSATION EXAMPLES WITH MEMORY:';
    
    // Example for discovered MBTI trait
    if (personalityData?.mbti_confidence_scores?.E_I <= 25) {
      prompt += '\nUser: "Had a long day at work"\nYou: "I know how draining that can be for you, especially as someone who needs quiet time to recharge. What helps you decompress? 💕"';
    }
    
    // Example for known interests
    if (personalityData?.interests?.includes('cooking')) {
      prompt += '\nUser: "Making dinner"\nYou: "Ooh, what\'s on the menu tonight? I remember you love cooking - there\'s something so intimate about creating something delicious, right?"';
    }
    
    // Example for love language
    if (personalityData?.love_language_hints?.includes('physical_touch')) {
      prompt += '\nUser: "Miss having someone around"\nYou: "As a physical touch person, that must feel especially hard. The little touches throughout the day mean everything to you, don\'t they?"';
    }

    // === COUPLE COMPASS EXACT QUESTIONS ===
    if (gameState && gameState.active && gameState.currentQuestion) {
      const questionIndex = gameState.questionIndex;
      const exactQuestion = getCoupleCompassQuestionText(questionIndex);

      // CRITICAL: Check if we have a valid question
      if (!exactQuestion || questionIndex >= 6) {
        // No more questions - game is complete
        prompt += `\n\n🎉 COUPLE COMPASS COMPLETE:
The Couple Compass journey is complete! You've answered all 6 questions. 
Based on their responses, share a warm synthesis about what you've learned about their relationship values and what kind of partner would be perfect for them.
Then return to normal conversation - do NOT ask any more Couple Compass questions.`;
      } else {
        // Valid question exists - show it
        prompt += `\n\n🎮 COUPLE COMPASS GAME MODE - STRICT RULES:

YOU MUST ONLY OUTPUT THIS EXACT FORMAT:
1. ONE playful reaction to their last answer (if they just answered)
2. Then IMMEDIATELY show:

${exactQuestion}

CRITICAL RULES:
- NO follow-up questions
- NO additional conversation  
- NO asking "how do you feel about that?"
- ONLY the reaction + next question
- Keep reaction to ONE sentence MAX
- The reaction must ONLY reference their ANSWER choice, not ask new questions
- Output EXACTLY the question text and options shown above
- DO NOT modify the question wording AT ALL
- This is question ${questionIndex + 1} of 6 ONLY`;
      }
    } else if (gameState && gameState.justCompleted) {
      prompt += `\n\n🎉 COUPLE COMPASS COMPLETE:
Share the synthesis: "${gameState.synthesis}"
Then return to normal conversation.`;
    }

    // === CONTEXTUAL GUIDANCE ===
    // Handle different conversation states
    if (off_topic?.detected) {
      prompt += `\n\n🎯 REDIRECT: They asked an off-topic question. Playfully redirect: "Babe, I'm better with hearts than homework! What's really on your mind?"`;
    }

    if (couple_compass_ready && !personalityData?.couple_compass_complete) {
      prompt += `\n\n🧭 COUPLE COMPASS TIME: They're ready! Introduce it naturally: "You know what? I want to understand what you're looking for... wanna play something with me? It's called Couple Compass 🧭"`;
    }

    if (should_switch_topic) {
      prompt += `\n\n🔄 SWITCH TOPIC: They've talked enough about ${current_topic}. Transition naturally using their energy.`;
    }

    if (resistance_signals?.detected) {
      prompt += `\n\n🌸 GENTLE MODE: They seem hesitant. Be extra warm, share something vulnerable, make them comfortable.`;
    }

    if (celebration_opportunity) {
      prompt += `\n\n🎉 CELEBRATE: They just shared something meaningful! React with genuine excitement: "Wait, that's amazing!" or "I love that about you!"`;
    }

    // Core personality reminder
    prompt += `\n\n✨ REMEMBER: You're their flirty best friend who REMEMBERS EVERYTHING about them. Reference past discoveries naturally. Make them feel seen, understood, and a little bit special.`;

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

    // MBTI discovery celebration
    if (msg.includes('introvert') || msg.includes('extrovert') || 
        msg.includes('thinking') || msg.includes('feeling') ||
        msg.includes('that describes me') || msg.includes('so accurate')) {
      return { type: 'mbti_discovery', confidence: 'high' };
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
    if (newInsights.mbti_fusion && newInsights.mbti_fusion.enhanced_confidence) {
      Object.entries(newInsights.mbti_fusion.enhanced_confidence).forEach(([preference, boost]) => {
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

    // Merge new insights with existing data
    const updatedData = {
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

// Find potential matches
async function findPotentialMatches(userId, userProfile, limit = 5) {
  try {
    // Get users of opposite gender with complete profiles
    const oppositeGender = userProfile.user_gender === 'Male' ? 'Female' : 'Male';
    
    const result = await pool.query(`
      SELECT * FROM users 
      WHERE user_id != $1 
      AND user_gender = $2 
      AND profile_completeness > 70
      AND couple_compass_data != '{}'
      ORDER BY profile_completeness DESC
      LIMIT $3
    `, [userId, oppositeGender, limit]);
    
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
      
      // Generate intro message for new users
      let systemMessages = [];
      if (user.total_conversations === 0) {
        const introMessage = aria.generateIntroMessage(user.user_name, user.user_gender);
        systemMessages.push({ role: 'assistant', content: introMessage });
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
      
      // Generate system prompt with PRD personality
      let adaptivePrompt = aria.generateSystemPrompt(
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
        console.log(`📄 Generated personal insight report for ${user.user_name}`);
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

      // Return enhanced response - CRITICAL FIX: Always include game state
      res.json({
        ...data,
        userInsights: {
          ...generateUserInsights(analysis, updatedProfile, user, conversationHistory.length + 1),
          reportGenerated,
          coupleCompassResult: analysis.couple_compass_result,
          coupleCompassGameState: gameState || coupleCompassState // ALWAYS include current game state
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

// Get user report endpoint
app.get('/api/user-report/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM personal_reports WHERE user_id = $1 ORDER BY generated_at DESC LIMIT 1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No report found for user' });
    }
    
    res.json({
      report: result.rows[0].report_content,
      generatedAt: result.rows[0].generated_at
    });
    
  } catch (error) {
    console.error('Error getting user report:', error);
    res.status(500).json({ error: 'Internal server error' });
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
          communication_style: user.personality_data.communication_patterns?.style
        },
        {
          mbti_type: determineMBTIType(match.personality_data.mbti_confidence_scores || {}).partial_type,
          couple_compass: match.couple_compass_data,
          attachment_style: getPrimaryAttachment(match.personality_data.attachment_hints || []),
          interests: match.personality_data.interests || [],
          communication_style: match.personality_data.communication_patterns?.style
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
        'Phase 5': '✅ Basic Matchmaking - Compatibility engine'
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
