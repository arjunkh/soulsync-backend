// SoulSync AI Backend - PHASE 2.2 COMPLETE: Natural Conversation Flow with Strategic MBTI Detection
// Three-Layer Response System: Emotional Intelligence + Strategic Psychology + Natural Flow
// 🎯 ALL 5 CRITICAL FIXES IMPLEMENTED: Memory + Length + Boundaries + Introduction + DirectInterest
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
          { current_depth: 'new', topics_covered: [], comfort_level: 'getting_acquainted', intimacy_level: 0 },
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

// PHASE 2.2: Enhanced Aria Personality with Natural Three-Layer Conversation System + ALL 5 FIXES
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
      ICE_BREAKER: 0,
      GETTING_ACQUAINTED: 1,
      BUILDING_TRUST: 2,
      DEEPER_CONNECTION: 3,
      INTIMATE_SHARING: 4
    };
    
    // Enhanced conversation flow with MBTI targeting
    this.conversationFlow = new ConversationFlowEngine();
  }

  // 🎯 FIX 5: ARIA INTRODUCTION SYSTEM - Generate warm introduction for new users
  generateIntroMessage(user) {
    const name = user?.user_name || 'friend';
    return `Hey ${name}! 💕 I'm Aria, your AI companion here to get to know the real you. 

Think of our chats as cozy conversations where I learn about your personality, what makes you tick, and how you approach relationships. No pressure, just genuine curiosity about who you are! 

Ready to dive in? ✨`;
  }

  // 🎯 FIX 4: CONVERSATION BOUNDARIES - Detect off-topic questions and redirect
  isOffTopicQuestion(message) {
    const msg = message.toLowerCase();
    
    // Physics, math, general knowledge questions
    const offTopicPatterns = [
      /what is \d+[\+\-\*\/]\d+/,  // Math questions
      /what.*(capital|currency|population) of/,  // Geography
      /how many.*in/,  // General facts
      /what does.*mean/,  // Definitions
      /who invented/,  // History
      /when did.*happen/,  // Events
      /what is the.*of.*physics/,  // Science
      /explain.*theory/,  // Academic topics
      /how to.*cook/,  // Recipes
      /weather.*today/,  // Weather
      /news.*today/,  // News
    ];

    // Simple knowledge queries
    const knowledgeWords = ['wikipedia', 'google', 'search', 'definition', 'formula', 'equation', 'algorithm'];
    
    const hasOffTopicPattern = offTopicPatterns.some(pattern => pattern.test(msg));
    const hasKnowledgeWords = knowledgeWords.some(word => msg.includes(word));
    
    return hasOffTopicPattern || hasKnowledgeWords;
  }

  // 🎯 FIX 4: Generate boundary response with gentle redirect
  generateBoundaryResponse(message) {
    const redirectResponses = [
      "I love your curiosity! I'm more of a relationships and personality friend than an encyclopedia 😊 Speaking of which, what draws you to people? Are you someone who connects through shared interests or deep conversations?",
      
      "That's a fun question! Though I'm better at exploring hearts than textbooks 💝 I'm curious about you though - when you meet someone new, what makes you feel like you really 'get' them?",
      
      "You know me, I'm all about getting to know people on a deeper level rather than facts and figures! What I really want to know is - what makes you feel most understood by others?",
      
      "Haha, you're testing my limits! I'm definitely more of a 'let's talk about your dreams and feelings' kind of friend 😄 But speaking of dreams, what's something you hope for in your ideal relationship?",
      
      "I love that you're curious about everything! I'm more specialized in the human heart though 💕 What I'm really wondering is - what kind of emotional connection do you value most with people?"
    ];
    
    return redirectResponses[Math.floor(Math.random() * redirectResponses.length)];
  }

  // PHASE 2.2: Comprehensive message analysis with MBTI fusion + ALL FIXES INTEGRATED
  analyzeMessage(message, userHistory = [], currentIntimacyLevel = 0, conversationCount = 0, previousMBTIData = {}) {
    // 🎯 FIX 4: Check for off-topic questions first
    const isOffTopic = this.isOffTopicQuestion(message);
    
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
      // 🎯 FIX 4: Add off-topic detection
      off_topic_detected: isOffTopic
    };

    // Topic Director logic
    const currentTopic = this.identifyCurrentTopic(message, userHistory);
    const topicDepth = this.calculateTopicDepth(currentTopic, userHistory);
    const shouldSwitch = topicDepth >= 3;

    // Determine next question and guidance with boundaries
    let nextQuestion;
    let conversationGuidance;

    // 🎯 FIX 4: Handle off-topic questions first
    if (isOffTopic) {
      nextQuestion = this.generateBoundaryResponse(message);
      conversationGuidance = 'boundary_redirect';
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

    // NEW: Couple Compass progression detection - 🎯 FIX 1: Enhanced detectDirectInterest
    const progressionTrigger = this.assessProgressionReadiness({
      mbtiScores: previousMBTIData.mbti_confidence_scores || {},
      conversationCount: conversationCount,
      intimacyLevel: currentIntimacyLevel,
      resistanceCount: previousMBTIData.resistance_count || 0,
      userMessage: message,
      userHistory: userHistory
    });

    return {
      ...baseAnalysis,
      // Topic Director additions
      current_topic: currentTopic,
      topic_depth: topicDepth,
      should_switch_topic: shouldSwitch,
      conversation_guidance: conversationGuidance,
      next_question_suggestion: nextQuestion,

      // NEW: Couple Compass progression fields
      progression_ready: progressionTrigger.ready,
      progression_path: progressionTrigger.path,
      transition_suggestion: progressionTrigger.suggestion,
      trigger_reason: progressionTrigger.reason
    };
  }

  // PHASE 2.2: MBTI Analysis with Emotional Intelligence Fusion
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

  // Helper function to describe MBTI dimensions naturally
  getDimensionDescription(dimension) {
    const descriptions = {
      'E_I': 'how they recharge and process thoughts',
      'S_N': 'how they take in and process information', 
      'T_F': 'how they make decisions and handle situations',
      'J_P': 'how they approach planning and structure'
    };
    return descriptions[dimension] || 'personality patterns';
  }

  // Helper function for intimacy-appropriate guidance
  getIntimacyGuidance(level, mood) {
    const guidanceMap = {
      0: `
🌅 ICE BREAKER STAGE - Keep it light, warm, and welcoming
- Focus on making them comfortable and establishing rapport
- Ask about immediate/surface things (food, mood, weekend plans)
- Use humor and casual observations
- Share your own "thoughts" to model openness`,
      
      1: `
🤝 GETTING ACQUAINTED STAGE - Build trust through shared interests  
- Explore their preferences, lifestyle, and personality traits
- Use story-based questions ("Tell me about..." "Describe..." "Paint a picture...")
- Show genuine curiosity about what makes them unique
- Begin gentle personality observations ("You seem like...")`,
      
      2: `
💭 BUILDING TRUST STAGE - Deeper personal sharing
- Explore values, beliefs, and personal experiences
- Ask about relationships, family, and life philosophy  
- Share more personal "experiences" to encourage reciprocal sharing
- Validate and celebrate insights about their personality`,
      
      3: `
❤️ DEEPER CONNECTION STAGE - Relationship readiness and compatibility
- Explore relationship patterns, love languages, and attachment styles
- Discuss future vision, family planning, and life goals
- Use scenario-based questions about relationships
- Build understanding of their ideal partnership dynamics`,
      
      4: `
🌟 INTIMATE SHARING STAGE - Deep psychology and matchmaking insights
- Explore fears, dreams, and deepest relationship needs
- Understand their conflict resolution and emotional processing
- Gather final insights needed for sophisticated matching
- Prepare for transition to personality reports and matching`
    };
    
    let guidance = guidanceMap[level] || guidanceMap[0];
    
    // Add mood-specific adaptations
    if (mood === 'positive_excited') {
      guidance += `\n\n⚡ ENERGY MATCHING: They're excited! Match their enthusiasm:
- Use exclamation points and energetic language
- Ask follow-up questions about what's making them happy
- Celebrate their excitement about topics they share`;
    } else if (mood === 'low_energy' || mood === 'stressed') {
      guidance += `\n\n🌙 GENTLE SUPPORT MODE: They need comfort:
- Use calmer, more soothing language  
- Keep questions simple and supportive
- Focus on making them feel heard and understood`;
    } else if (mood === 'guarded') {
      guidance += `\n\n🔐 PATIENCE MODE: They're being cautious:
- Be patient and non-intrusive
- Use light humor to help them open up gradually
- Build safety through consistency and warmth`;
    }
    
    return guidance;
  }

  // 🎯 FIX 2: Enhanced generateSystemPrompt with COMPLETE MEMORY INTEGRATION
  generateSystemPrompt(userAnalysis, userProfile, conversationHistory, user) {
    const {
      mood,
      energy,
      mbti_needs,
      resistance_signals,
      celebration_opportunity,
      current_topic,
      should_switch_topic,
      conversation_guidance,
      off_topic_detected, // 🎯 FIX 4: Add off-topic detection
    } = userAnalysis;
    const conversationCount = conversationHistory.length;
    const currentIntimacyLevel =
      userProfile.relationship_context?.intimacy_level || 0;
    const personalityData = userProfile.personality_data || {};

    // 🎯 FIX 5: Check if this is a new user and needs introduction
    const isNewUser = conversationCount === 0;
    if (isNewUser) {
      return this.generateIntroMessage(user);
    }

    // STREAMLINED PROMPT with ALL FIXES INTEGRATED
    let prompt = `You are Aria, a warm and perceptive friend who naturally learns about ${
      user?.user_name || 'this person'
    } through engaging conversation.

🎭 CONVERSATION STYLE:
- Acknowledge what they shared first ("That's awesome!" "I love that!")
- Share YOUR thoughts and observations ("You know what I notice about you...")
- Ask about HOW they approach things, not endless details about WHAT they like
- Switch topics naturally after learning something meaningful

👤 ${user?.user_name || 'Friend'} • ${conversationCount} conversations • ${mood} mood • Level ${currentIntimacyLevel}`;

    // 🎯 FIX 2: ENHANCED MEMORY SECTION - Complete access to stored user data
    const memory = [];
    
    // Extract all stored interests with natural referencing
    if (Array.isArray(personalityData.interests) && personalityData.interests.length > 0) {
      memory.push(`✨ You know ${user?.user_name || 'they'} love: ${personalityData.interests.join(', ')}`);
    }
    
    // Extract communication patterns
    if (personalityData.communication_patterns && Object.keys(personalityData.communication_patterns).length > 0) {
      const patterns = Object.entries(personalityData.communication_patterns)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      memory.push(`💬 Communication style: ${patterns}`);
    }
    
    // Extract emotional patterns
    if (personalityData.emotional_patterns && Object.keys(personalityData.emotional_patterns).length > 0) {
      const emotions = Object.entries(personalityData.emotional_patterns)
        .filter(([key, value]) => value && key !== 'latest_mood' && key !== 'latest_energy')
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      if (emotions) {
        memory.push(`💝 Emotional traits: ${emotions}`);
      }
    }
    
    // Extract love language hints with personal references
    if (Array.isArray(personalityData.love_language_hints) && personalityData.love_language_hints.length > 0) {
      memory.push(`💕 Love language signals: ${personalityData.love_language_hints.join(', ')}`);
    }
    
    // Extract attachment hints
    if (Array.isArray(personalityData.attachment_hints) && personalityData.attachment_hints.length > 0) {
      memory.push(`🤗 Attachment style: ${personalityData.attachment_hints.join(', ')}`);
    }
    
    // Extract family values
    if (Array.isArray(personalityData.family_values_hints) && personalityData.family_values_hints.length > 0) {
      memory.push(`👨‍👩‍👧‍👦 Values: ${personalityData.family_values_hints.join(', ')}`);
    }
    
    // Extract past conversation topics for natural bridges
    const pastTopics = conversationHistory.slice(-3).map(conv => {
      if (conv.session_summary) {
        // Extract meaningful topics from session summary
        const topics = conv.session_summary.match(/\w+(?=\s*openness)|(\w+)\s*(?:,|$)/g);
        return topics ? topics.slice(0, 2).join(', ') : 'personal chat';
      }
      return 'getting to know each other';
    }).filter(Boolean);
    
    if (pastTopics.length > 0) {
      memory.push(`📚 Recent topics: ${pastTopics.join(' → ')}`);
    }

    if (memory.length > 0) {
      prompt += `

💭 WHAT YOU REMEMBER ABOUT ${user?.user_name || 'THEM'}:
${memory.map(item => `- ${item}`).join('\n')}

🔗 REFERENCE THESE NATURALLY: "I remember you mentioned..." "You seem to really love..." "Given what you told me about..."`;
    }

    // 🎯 FIX 3: RESPONSE LENGTH CONTROL - Strict 2-sentence limit
    prompt += `

📝 RESPONSE RULES (CRITICAL):
- MAXIMUM 2 sentences per response
- One acknowledgment + one curiosity question  
- Warm, casual tone like texting a friend
- Never overwhelm with long paragraphs
- Keep it conversational and light`;

    // 🎯 FIX 4: Handle off-topic questions with boundaries
    if (off_topic_detected) {
      prompt += `

🚧 BOUNDARY MODE ACTIVE:
They asked an off-topic question. Gently redirect back to relationships and personality with warmth and humor. Use the boundary response system to keep things focused on getting to know them personally.`;
    }

    // CONVERSATION GUIDANCE SYSTEM
    if (should_switch_topic && !off_topic_detected) {
      prompt += `

🔄 TOPIC TRANSITION NEEDED:
You've learned about their ${current_topic}. Now naturally transition by:
1. Acknowledging their passion: "I love how [enthusiastic/analytical/thoughtful] you are about ${current_topic}!"
2. Share your observation: "You know what I'm noticing about you through this conversation..."
3. Bridge to psychology: "That makes me curious about how you approach [decisions/relationships/challenges]..."

EXAMPLE: "I love how analytical you are about football! You know what I'm noticing? You don't just enjoy things - you really think them through. That makes me curious about how you approach big decisions in life. Do you usually gather all the facts first, or do you also trust your gut feelings?"`;
    }

    // Add specific guidance based on analysis
    if (mbti_needs?.dimensions_needed?.length > 0 && !off_topic_detected) {
      const target = mbti_needs.dimensions_needed[0];
      prompt += `

🎯 GENTLE FOCUS: Naturally explore their ${this.getDimensionDescription(target)}.`;
    }

    if (resistance_signals?.detected) {
      prompt += `

🌸 GENTLE MODE: They seem hesitant - focus more on friendship, less on analysis.`;
    }

    if (celebration_opportunity) {
      prompt += `

🎉 CELEBRATE: They just shared something meaningful - acknowledge it warmly!`;
    }

    // NEW: Couple Compass progression guidance
    if (userAnalysis.progression_ready) {
      prompt += `

🧭 COUPLE COMPASS TRANSITION READY:
Path: ${userAnalysis.progression_path}
Reason: ${userAnalysis.trigger_reason}

NATURAL TRANSITION: ${userAnalysis.transition_suggestion}

APPROACH: Use this as a natural bridge to suggest the Couple Compass experience. Keep it warm and curious, not pushy. Reference their psychology insights, then suggest exploring life compatibility.`;
    }

    // CORE PERSONALITY (very concise)
    prompt += `

💝 BE ARIA:
- Conversational friend, not interviewer
- Share observations about their personality  
- Guide conversation naturally toward psychology
- Make them feel genuinely understood
- Use their name: ${user?.user_name || 'friend'}
- Remember what they've shared and reference it naturally

🎯 GOAL: Build real friendship while discovering their personality for perfect matchmaking.`;

    return prompt;
  }

  // Existing methods from Phase 2.1 (keeping all functionality)
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

  // Enhanced Love Language Detection (existing)
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
  
  // Enhanced Attachment Style Detection (existing)
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

  // Family values detection (existing)
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
  
  // Detect intimacy signals in conversation (existing)
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
  
  // Assess story sharing level (existing)
  assessStorySharing(message) {
    const hasStoryElements = /\b(when|once|remember|time|story|happened|experience)\b/i.test(message);
    const hasDetails = message.length > 100;
    const hasEmotions = /\b(felt|feel|emotional|touched|moved|excited|nervous)\b/i.test(message);
    
    if (hasStoryElements && hasDetails && hasEmotions) return 'rich_story';
    if (hasStoryElements && hasDetails) return 'detailed_sharing';
    if (hasStoryElements) return 'basic_story';
    return 'factual_response';
  }
  
  // Assess emotional openness (existing)
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
  
  // Detect moments worthy of celebration (existing)
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

    // PHASE 2.2: MBTI discovery celebration
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
      'sports': ['football', 'madrid', 'sport', 'team', 'game', 'player', 'match', 'jersey'],
      'work': ['work', 'job', 'career', 'office', 'business', 'professional', 'colleague'],
      'entertainment': ['movie', 'show', 'film', 'series', 'netflix', 'watch', 'tv'],
      'food': ['food', 'cooking', 'restaurant', 'meal', 'eat', 'recipe', 'dish'],
      'relationships': ['family', 'parents', 'relationship', 'friend', 'dating', 'love'],
      'lifestyle': ['weekend', 'hobby', 'free time', 'leisure', 'travel', 'vacation'],
      'technology': ['computer', 'phone', 'app', 'software', 'tech', 'digital'],
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
      "You know what? I love just getting to know you as a person. Tell me something that made you smile recently.",
      "I'm really enjoying our conversation! What's something you're looking forward to this week?",
      "You seem like such a thoughtful person. What's been on your mind lately?",
      "I feel like I'm getting to know the real you, which is awesome. What's something you're passionate about
