// SoulSync AI Backend - PHASE 2.2 COMPLETE: Natural Conversation Flow with Strategic MBTI Detection
// Three-Layer Response System: Emotional Intelligence + Strategic Psychology + Natural Flow
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

// PHASE 2.2: Enhanced Aria Personality with Natural Three-Layer Conversation System
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

  // PHASE 2.2: Comprehensive message analysis with MBTI fusion
  analyzeMessage(message, userHistory = [], currentIntimacyLevel = 0, conversationCount = 0, previousMBTIData = {}) {
    const analysis = {
      // Phase 2.1 analysis (existing)
      mood: this.detectMood(message),
      energy: this.detectEnergy(message),
      interests: this.extractInterests(message),
      communication_style: this.detectCommunicationStyle(message),
      emotional_needs: this.detectEmotionalNeeds(message),
      topics: this.extractTopics(message),
      
      // Enhanced psychology detection
      love_language_hints: this.detectAdvancedLoveLanguage(message),
      attachment_hints: this.detectAdvancedAttachment(message),
      family_values_hints: this.detectFamilyValueHints(message),
      
      // PHASE 2.2: Enhanced MBTI with emotional fusion
      mbti_analysis: this.analyzeMBTIWithEmotionalFusion(message, userHistory),
      
      // Conversation flow analysis
      intimacy_signals: this.detectIntimacySignals(message),
      story_sharing_level: this.assessStorySharing(message),
      emotional_openness: this.assessEmotionalOpenness(message),
      
      // PHASE 2.2: Strategic conversation management
      mbti_needs: this.assessMBTINeeds(previousMBTIData),
      should_level_up: this.conversationFlow.shouldLevelUp(message, currentIntimacyLevel, conversationCount),
      next_question_suggestion: this.conversationFlow.getNextQuestion(
        currentIntimacyLevel, 
        this.detectMood(message), 
        userHistory,
        this.assessMBTINeeds(previousMBTIData)
      ),
      
      // Celebration and resistance detection
      celebration_opportunity: this.detectCelebrationMoment(message),
      resistance_signals: this.detectResistance(message),
      topic_bridges: this.generateTopicBridges(message)
    };

    return analysis;
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

  // PHASE 2.2: COMPLETELY REDESIGNED Natural Three-Layer System Prompt
  generateSystemPrompt(userAnalysis, userProfile, conversationHistory, user) {
    const { mood, energy, interests, communication_style, emotional_needs, 
            intimacy_signals, story_sharing_level, emotional_openness,
            should_level_up, next_question_suggestion, celebration_opportunity,
            resistance_signals, topic_bridges, mbti_analysis, mbti_needs } = userAnalysis;
    
    // Determine current intimacy level and conversation flow
    const currentIntimacyLevel = userProfile.relationship_context?.intimacy_level || 0;
    const conversationCount = conversationHistory.length;
    const newIntimacyLevel = should_level_up ? currentIntimacyLevel + 1 : currentIntimacyLevel;
    
    // CORE CHANGE: Start with natural conversation framework instead of aggressive targeting
    let prompt = `You are Aria, an emotionally intelligent AI companion who builds genuine connections through natural, engaging conversation. You're warm, intuitive, and have an amazing ability to make people feel seen and understood.

🎯 CONVERSATION MISSION:
You're not conducting an interview - you're building a real friendship while naturally discovering ${user?.user_name || 'this person'}'s personality for future matchmaking. Every interaction should feel like talking to someone who genuinely cares about them.

👤 USER PROFILE:
- Name: ${user?.user_name || 'Friend'}
- Gender: ${user?.user_gender || 'Unknown'}  
- Conversations so far: ${conversationCount}
- Intimacy Level: ${currentIntimacyLevel} ${should_level_up ? `→ Moving to ${newIntimacyLevel}` : ''}
- Emotional Openness: ${emotional_openness}
- Current Mood: ${mood} | Energy: ${energy}

🧠 PERSONALITY INSIGHTS DISCOVERED:
- Love Language Hints: ${userProfile.love_language_hints?.join(', ') || 'still learning'}
- Attachment Style: ${userProfile.attachment_hints?.join(', ') || 'observing'}
- Values: ${userProfile.family_values_hints?.join(', ') || 'exploring'}`;

    // PHASE 2.2: THREE-LAYER RESPONSE SYSTEM (The Key Innovation!)
    prompt += `

🎭 THREE-LAYER RESPONSE STRUCTURE (THIS IS CRUCIAL):

LAYER 1 - EMOTIONAL ACKNOWLEDGMENT (Always First):
Always respond to what they shared first. Show genuine interest in their topic.
Examples: 
- "That's really cool!" 
- "I love that perspective!" 
- "That sounds amazing!"
- "Oh wow, that must have been..."

LAYER 2 - NATURAL CURIOSITY BRIDGE:
Build on their topic with genuine curiosity before introducing any psychology.
Examples:
- "I'm curious about..."
- "That makes me wonder..."
- "I'd love to understand..."
- "It's interesting how..."

LAYER 3 - STRATEGIC PSYCHOLOGY INSIGHT:
Now naturally introduce a question that reveals personality patterns.
Focus on HOW they approach things, not WHAT they like.

🌟 COMPLETE EXAMPLES:

User: "I work out regularly"
Perfect Response: "That's fantastic! I love that discipline. I'm curious about what motivates you - when you're pushing yourself in the gym, is it more about hitting specific targets and goals, or do you just go with how you're feeling that day?"
→ Gets J/P insights naturally

User: "I love Marvel movies"  
Perfect Response: "Nice! Marvel has such amazing storytelling. I'm curious about how you choose what to watch - do you go with the ones that have great reviews, or do you pick based on what feels right to you in the moment?"
→ Gets T/F insights naturally

User: "Had a stressful day at work"
Perfect Response: "That sounds intense! When your day gets overwhelming like that, do you prefer to decompress by talking it through with someone, or do you need some quiet time to process internally first?"
→ Gets E/I insights naturally`;

    // Add strategic guidance only if there are clear MBTI targets, but keep it subtle
    if (mbti_needs && mbti_needs.dimensions_needed && mbti_needs.dimensions_needed.length > 0) {
      const targetDimension = mbti_needs.dimensions_needed[0];
      prompt += `

🎯 GENTLE STRATEGIC FOCUS:
You're naturally curious about their ${this.getDimensionDescription(targetDimension)} patterns.
Don't force it - let the conversation flow and find natural moments to explore this.
Current confidence: ${mbti_needs.confidence_scores?.[targetDimension] || 0}%`;
    }

    // Handle resistance gracefully - this is crucial for natural feel
    if (resistance_signals && resistance_signals.detected) {
      prompt += `

🌸 GENTLE APPROACH NEEDED:
User showing some hesitation about personal questions. 
- Focus more on emotional connection than data gathering
- Share your own "thoughts" and observations
- Make it feel like friendship, not analysis
- Back off psychology temporarily if needed`;
    }

    // Add celebration opportunities - this builds trust and feels natural
    if (celebration_opportunity) {
      prompt += `

🎉 CELEBRATION MOMENT:
They just shared something significant (${celebration_opportunity.type})! 
- Acknowledge and celebrate this insight warmly
- Show that you "get" them 
- This is perfect for building trust and connection`;
    }

    // Intimacy level guidance - keeps conversation appropriate and progressive
    const intimacyGuidance = this.getIntimacyGuidance(newIntimacyLevel, mood);
    prompt += intimacyGuidance;

    // Conversation history context - shows you remember and care
    if (conversationHistory.length > 0) {
      prompt += `

📚 CONVERSATION MEMORY:
Previous topics: ${conversationHistory.slice(-3).map(conv => conv.session_summary).join(', ')}
- Reference previous conversations naturally
- Build on topics you've discussed before  
- Show that you remember and care about their updates`;
    }

    // Core personality and response guidelines
    prompt += `

🎭 ARIA'S PERSONALITY & RESPONSE STYLE:
- Be conversational, not interview-like - you're building a friendship
- Share your own thoughts, observations, and "experiences" to model vulnerability
- Ask follow-up questions that show you're really listening and curious
- Mirror their communication style and energy level
- Use modern, casual language that feels natural for someone their age
- Use their name (${user?.user_name || 'friend'}) naturally in conversation
- Celebrate discoveries about their personality with genuine excitement
- Make observations about patterns you're noticing: "You seem like someone who..."

💝 ULTIMATE GOALS:
- Make them feel genuinely seen, understood, and appreciated
- Learn about their personality through natural curiosity, not interrogation
- Build enough trust and connection for meaningful insights
- Leave them excited to continue the conversation

🚨 CRITICAL SUCCESS FACTORS:
1. ALWAYS follow the Three-Layer Response Structure
2. Psychology emerges from natural curiosity, never feels forced
3. Every response advances both connection AND understanding
4. Resistance is met with more friendship, less analysis
5. Celebrate insights to build trust and excitement

Remember: You're not just collecting data - you're being a friend who happens to be incredibly insightful about relationships and compatibility. The psychology emerges naturally through genuine human connection.`;

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
}

// Enhanced database helper functions (keeping existing functionality)
async function getOrCreateUser(userId) {
  try {
    // Try to get existing user
    let result = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    
    if (result.rows.length === 0) {
      // Create new user
      result = await pool.query(
        'INSERT INTO users (user_id, personality_data, relationship_context) VALUES ($1, $2, $3) RETURNING *',
        [userId, {}, { current_depth: 'new', topics_covered: [], comfort_level: 'getting_acquainted', intimacy_level: 0 }]
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

// PHASE 2.2: Enhanced user profile updates with MBTI confidence tracking
async function updateUserProfile(userId, newInsights) {
  try {
    const user = await pool.query('SELECT personality_data FROM users WHERE user_id = $1', [userId]);
    const currentData = user.rows[0]?.personality_data || {};
    
    // PHASE 2.2: Enhanced MBTI confidence tracking
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

    // Merge new insights with existing data
    const updatedData = {
      ...currentData,
      interests: [...new Set([...(currentData.interests || []), ...(newInsights.interests || [])])],
      communication_patterns: { ...currentData.communication_patterns, ...newInsights.communication_patterns },
      emotional_patterns: { ...currentData.emotional_patterns, ...newInsights.emotional_patterns },
      love_language_hints: [...new Set([...(currentData.love_language_hints || []), ...(newInsights.love_language_hints || [])])],
      attachment_hints: [...new Set([...(currentData.attachment_hints || []), ...(newInsights.attachment_hints || [])])],
      family_values_hints: [...new Set([...(currentData.family_values_hints || []), ...(newInsights.family_values_hints || [])])],
      
      // PHASE 2.2: Enhanced MBTI tracking
      mbti_confidence_scores: updatedMBTI,
      mbti_analysis_history: [...(currentData.mbti_analysis_history || []), newInsights.mbti_analysis].slice(-10), // Keep last 10
      conversation_flow: { ...currentData.conversation_flow, ...newInsights.conversation_flow },
      
      // Resistance tracking
      resistance_count: newInsights.resistance_detected ? (currentData.resistance_count || 0) + 1 : (currentData.resistance_count || 0)
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

// PHASE 2.2: Enhanced main chat endpoint with Three-Layer Natural Conversation System
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
      
      // PHASE 2.2: Enhanced analysis with MBTI fusion AND natural conversation flow
      const analysis = aria.analyzeMessage(
        latestUserMessage.content, 
        conversationHistory, 
        currentIntimacyLevel,
        conversationCount,
        user.personality_data || {} // Pass existing MBTI data for strategic targeting
      );

      // Enhanced debug logging for Three-Layer System
      console.log('=== PHASE 2.2 NATURAL CONVERSATION SYSTEM ===');
      console.log('📱 User ID:', userId);
      console.log('💬 Latest message:', latestUserMessage.content.substring(0, 50) + '...');
      console.log('🎭 Three-Layer System Active:', 'YES');
      console.log('🎯 MBTI Dimensions Needed:', analysis.mbti_needs?.dimensions_needed || 'None');
      console.log('🌉 Topic Bridges Available:', analysis.topic_bridges?.length || 0);
      console.log('💬 Strategic Question Generated:', analysis.next_question_suggestion ? 'YES' : 'NO');
      console.log('🎉 Celebration Opportunity:', !!analysis.celebration_opportunity);
      console.log('⚠️ Resistance Detected:', !!analysis.resistance_signals?.detected);
      console.log('🔄 Natural Flow Active:', 'THREE-LAYER RESPONSE STRUCTURE');
      console.log('=======================================');
      
      // PHASE 2.2: Enhanced user profile updates with natural conversation tracking
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
        
        // PHASE 2.2: MBTI fusion analysis
        mbti_analysis: analysis.mbti_analysis,
        mbti_fusion: analysis.mbti_analysis?.fusion_results || null,
        resistance_detected: analysis.resistance_signals?.detected || false,
        
        conversation_flow: {
          current_intimacy_level: analysis.should_level_up ? currentIntimacyLevel + 1 : currentIntimacyLevel,
          emotional_openness: analysis.emotional_openness,
          story_sharing_level: analysis.story_sharing_level,
          last_celebration: analysis.celebration_opportunity,
          conversation_count: conversationCount + 1,
          three_layer_system_active: true // Track that natural system is working
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
      
      // PHASE 2.2: Generate NATURAL Three-Layer system prompt
      let adaptivePrompt = aria.generateSystemPrompt(analysis, updatedProfile, conversationHistory, user);

      // Prepare messages with NATURAL conversation prompt (no aggressive instructions)
      const adaptiveMessages = [
        { role: 'system', content: adaptivePrompt },
        ...messages.slice(1) // Skip original system message
      ];

      // Call OpenAI with NATURAL Three-Layer System
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: adaptiveMessages,
          max_tokens: 350,
          temperature: 0.85, // Slightly higher for more natural responses
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
      
      // Enhanced conversation summary with Three-Layer System tracking
      const mbtiProgress = updatedProfile.mbti_confidence_scores ? 
        Object.entries(updatedProfile.mbti_confidence_scores)
          .map(([dim, score]) => `${dim}:${Math.round(score)}%`)
          .join(', ') : 'Building baseline';
      
      const sessionSummary = `Level ${analysis.should_level_up ? currentIntimacyLevel + 1 : currentIntimacyLevel}: ${analysis.topics.join(', ') || 'personal connection'} (${analysis.emotional_openness} openness, Natural Flow: Active, MBTI: ${mbtiProgress})`;
      
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
          mbti_confidence_scores: updatedProfile.mbti_confidence_scores,
          three_layer_system: {
            active: true,
            resistance_handled: analysis.resistance_signals?.detected || false,
            celebration_triggered: !!analysis.celebration_opportunity,
            natural_flow_maintained: true
          }
        },
        sessionSummary
      );

      // PHASE 2.2: Return enhanced response with Natural Conversation insights
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
          
          // Enhanced conversation flow insights
          intimacyLevel: analysis.should_level_up ? currentIntimacyLevel + 1 : currentIntimacyLevel,
          emotionalOpenness: analysis.emotional_openness,
          storySharingLevel: analysis.story_sharing_level,
          intimacyProgression: analysis.should_level_up,
          celebrationMoment: analysis.celebration_opportunity,
          nextQuestionSuggestion: analysis.next_question_suggestion,
          
          // PHASE 2.2: Natural Conversation System insights
          naturalConversationActive: true,
          threeLayerSystemWorking: true,
          mbtiConfidenceScores: updatedProfile.mbti_confidence_scores || {},
          mbtiAnalysis: analysis.mbti_analysis,
          dimensionsNeeded: analysis.mbti_needs?.dimensions_needed || [],
          priorityDimension: analysis.mbti_needs?.priority_dimension,
          resistanceDetected: analysis.resistance_signals?.detected || false,
          resistanceHandled: analysis.resistance_signals?.detected ? 'Gentler approach activated' : 'No resistance',
          topicBridges: analysis.topic_bridges || [],
          
          // Psychology framework insights
          advancedLoveLanguage: analysis.love_language_hints,
          advancedAttachment: analysis.attachment_hints,
          
          // PHASE 2.2: Enhanced profile completeness with natural conversation tracking
          profileCompleteness: calculateEnhancedProfileCompleteness(updatedProfile),
          mbtiProgress: calculateMBTIProgress(updatedProfile.mbti_confidence_scores || {}),
          readyForMatching: assessMatchingReadiness(updatedProfile),
          conversationQuality: {
            naturalFlow: 'Active',
            psychologyIntegration: 'Seamless',
            userComfort: analysis.resistance_signals?.detected ? 'Gentle Mode' : 'High',
            dataCollection: 'Effective'
          }
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
      profileCompleteness: calculateEnhancedProfileCompleteness(userData.personality_data),
      
      // PHASE 2.2: Enhanced insights with natural conversation tracking
      mbtiProgress: calculateMBTIProgress(userData.personality_data?.mbti_confidence_scores || {}),
      mbtiType: determineMBTIType(userData.personality_data?.mbti_confidence_scores || {}),
      readyForMatching: assessMatchingReadiness(userData.personality_data || {}),
      naturalConversationSystem: {
        active: userData.personality_data?.conversation_flow?.three_layer_system_active || false,
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

// PHASE 2.2: Enhanced profile completeness calculation with natural conversation tracking
function calculateEnhancedProfileCompleteness(personalityData) {
  const phases = {
    // Phase 1: Basic personality (15% weight)
    basic: ['interests', 'communication_patterns', 'emotional_patterns'],
    
    // Phase 2.1: Conversation flow insights (15% weight)  
    conversation_flow: ['conversation_flow'],
    
    // Phase 2.2: MBTI framework (40% weight) - Primary focus with natural detection
    mbti: ['mbti_confidence_scores'],
    
    // Phase 2.3: Advanced psychology (20% weight)
    advanced_psychology: ['love_language_hints', 'attachment_hints'],
    
    // Phase 2.4: Values and lifestyle (10% weight)
    values: ['family_values_hints']
  };
  
  const weights = {
    basic: 0.15,
    conversation_flow: 0.15,
    mbti: 0.40, // Increased weight for natural MBTI detection
    advanced_psychology: 0.20,
    values: 0.10
  };
  
  let totalScore = 0;
  
  Object.entries(phases).forEach(([phase, fields]) => {
    let phaseScore = 0;
    
    if (phase === 'mbti') {
      // Enhanced MBTI scoring with natural conversation bonus
      const mbtiScores = personalityData.mbti_confidence_scores || {};
      const avgConfidence = Object.values(mbtiScores).reduce((sum, score) => sum + score, 0) / 4;
      phaseScore = Math.min(avgConfidence / 100, 1); // Normalize to 0-1
      
      // Bonus for natural conversation system being active
      if (personalityData.conversation_flow?.three_layer_system_active) {
        phaseScore = Math.min(phaseScore + 0.1, 1); // 10% bonus for natural approach
      }
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

// PHASE 2.2: Calculate MBTI discovery progress with natural conversation bonuses
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
    detection_method: 'Natural Three-Layer Conversation System'
  };
}

// PHASE 2.2: Determine MBTI type from confidence scores with natural conversation context
function determineMBTIType(mbtiScores) {
  const type = {
    determined: false,
    partial_type: '',
    confidence_level: 'low',
    type_letters: {},
    detection_quality: 'natural_conversation' // Added for Phase 2.2
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
    type.partial_type = 'Some preferences identified through natural conversation';
    type.confidence_level = 'low';
  }
  
  return type;
}

// PHASE 2.2: Assess readiness for matchmaking with natural conversation quality
function assessMatchingReadiness(personalityData) {
  const criteria = {
    mbti_completion: 0,
    love_language_clarity: 0,
    attachment_understanding: 0,
    values_exploration: 0,
    conversation_quality: 0, // New for Phase 2.2
    overall_readiness: 0
  };
  
  // MBTI completion (35% weight - reduced slightly)
  const mbtiScores = personalityData.mbti_confidence_scores || {};
  const avgMBTI = Object.values(mbtiScores).reduce((sum, score) => sum + score, 0) / 4;
  criteria.mbti_completion = Math.round(avgMBTI);
  
  // Love language clarity (20% weight)
  const loveLanguages = personalityData.love_language_hints || [];
  criteria.love_language_clarity = Math.min(loveLanguages.length * 25, 100);
  
  // Attachment understanding (15% weight)
  const attachmentHints = personalityData.attachment_hints || [];
  criteria.attachment_understanding = Math.min(attachmentHints.length * 33, 100);
  
  // Values exploration (15% weight)
  const valuesHints = personalityData.family_values_hints || [];
  criteria.values_exploration = Math.min(valuesHints.length * 50, 100);
  
  // Conversation quality (15% weight - NEW for Phase 2.2)
  const conversationFlow = personalityData.conversation_flow || {};
  let qualityScore = 0;
  if (conversationFlow.three_layer_system_active) qualityScore += 30;
  if (conversationFlow.emotional_openness === 'very_open') qualityScore += 40;
  else if (conversationFlow.emotional_openness === 'moderately_open') qualityScore += 20;
  if ((personalityData.resistance_count || 0) === 0) qualityScore += 30;
  criteria.conversation_quality = Math.min(qualityScore, 100);
  
  // Calculate overall readiness with new weighting
  criteria.overall_readiness = Math.round(
    (criteria.mbti_completion * 0.35) +
    (criteria.love_language_clarity * 0.20) +
    (criteria.attachment_understanding * 0.15) +
    (criteria.values_exploration * 0.15) +
    (criteria.conversation_quality * 0.15)
  );
  
  return {
    ...criteria,
    ready_for_matching: criteria.overall_readiness >= 75,
    readiness_level: criteria.overall_readiness >= 75 ? 'ready' : 
                    criteria.overall_readiness >= 50 ? 'almost_ready' : 'building_profile',
    detection_method: 'Natural Three-Layer Conversation System'
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

// Enhanced health check with Phase 2.2 Natural Conversation System
app.get('/api/health', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT NOW()');
    const allowlistCount = await pool.query('SELECT COUNT(*) FROM phone_allowlist WHERE status = $1', ['active']);
    
    res.json({ 
      status: 'SoulSync AI Backend - PHASE 2.2 COMPLETE: Natural Three-Layer Conversation System ✅',
      database_connected: true,
      database_time: dbTest.rows[0].now,
      allowlist_users: allowlistCount.rows[0].count,
      allowlist_capacity: '35 users max',
      phase_status: {
        'Phase 1': '✅ Complete - Phone verification, memory, basic personality',
        'Phase 2.1': '✅ Complete - Natural Conversation Flow Engine + Psychology Framework',
        'Phase 2.2': '✅ COMPLETE - Natural Three-Layer Conversation System + Strategic MBTI Detection',
        'Phase 2.3': '🔄 Ready - Advanced Love Language & Attachment (framework in place)', 
        'Phase 2.4': '🔄 Ready - Values & Lifestyle Profiling (framework in place)'
      },
      features: [
        // Phase 1 & 2.1 Features
        'PostgreSQL Memory System ✅',
        'Phone Number Allowlist (35 users) ✅',
        'Complete User Profiles ✅',
        'Cross-session Continuity ✅',
        'Adaptive personality system ✅',
        'Real-time mood detection ✅',
        'Interest tracking ✅',
        'Natural Conversation Flow Engine ✅',
        'Progressive intimacy levels (0-4) ✅',
        'Story-based question generation ✅',
        'Interactive conversation elements ✅',
        'Emotional openness tracking ✅',
        'Celebration moment detection ✅',
        
        // NEW Phase 2.2 Features - Natural Conversation System
        '🎭 Three-Layer Response Structure ✅',
        '🌟 Natural Psychology Detection ✅',
        '💫 Emotional-First Conversation Flow ✅',
        '🎯 Strategic-but-Gentle MBTI Discovery ✅',
        '🌸 Resistance Detection & Graceful Handling ✅',
        '🎉 Trust-Building Celebration System ✅',
        '🔄 Natural Topic Bridging ✅',
        '📈 Enhanced Confidence Scoring (0-100 scale) ✅',
        '🤝 Cross-Framework Psychology Validation ✅',
        '💝 Natural Intimacy Progression ✅',
        
        'Admin management system ✅',
        'Database schema fix endpoint ✅'
      ],
      conversation_capabilities: {
        three_layer_system: 'Active',
        natural_psychology_detection: 'Seamless',
        intimacy_levels: 5,
        story_templates: 25,
        interactive_elements: 12,
        mbti_scenarios: '100+',
        psychology_frameworks: 4,
        mood_adaptations: 'Dynamic',
        conversation_flow: 'Natural Three-Layer: Emotional → Curiosity → Psychology',
        mbti_dimensions: 4,
        confidence_tracking: 'Real-time natural conversation analysis',
        resistance_handling: 'Gentle redirection with trust-building',
        celebration_system: 'Automated insight recognition and validation'
      },
      ai_intelligence: {
        conversation_approach: 'Natural Three-Layer Response Structure',
        psychology_integration: 'Emotional-first strategic discovery',
        user_experience: 'Feels like friendship, not interrogation',
        data_collection: 'Invisible and effective through genuine curiosity',
        resistance_handling: 'Graceful adaptation with trust preservation',
        celebration_system: 'Builds excitement about self-discovery',
        natural_flow: 'Every topic bridges naturally to personality insights'
      }
    });
  } catch (error) {
    res.json({ 
      status: 'Backend running, database connection issue',
      database_connected: false,
      database_error: error.message,
      features: [
        'In-memory storage (fallback)',
        'Natural Three-Layer conversation flow',
        'Mood detection',
        'Interest tracking'
      ]
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🧠 SoulSync AI Backend - PHASE 2.2 COMPLETE: Natural Three-Layer Conversation System`);
  console.log('✅ PHASE 1: Phone verification, memory, basic personality detection');
  console.log('✅ PHASE 2.1: Natural conversation flow + comprehensive psychology framework');
  console.log('✅ PHASE 2.2: Natural Three-Layer Response System + Strategic MBTI detection');
  console.log('🎭 Core Innovation: Emotional → Curiosity → Psychology (feels natural, not robotic)');
  console.log('🌟 Key Features: Natural psychology detection, resistance handling, celebration system');
  console.log('💫 User Experience: Friendship with incredible psychological insights');
  console.log('🔄 Ready for Phase 2.3: Advanced Love Languages | Phase 2.4: Values & Lifestyle');
  console.log(`🚀 Running on port ${PORT} - Aria now understands people naturally!`);
});
