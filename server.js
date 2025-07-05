// SoulSync AI Backend - Streamlined with GPT Brain
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const GPTBrain = require('./gpt-brain');
const app = express();

let server;

// Handle process termination gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.use(express.json());
// Error handler for malformed JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Bad JSON:', err.message);
    return res.status(400).json({ error: 'Invalid JSON format' });
  }
  next();
});

// Handle preflight requests
app.options('*', cors());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

// Test database connection immediately
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection test failed:', err);
  } else {
    console.log('✅ Database connection test successful:', res.rows[0].now);
  }
});

let gptBrain;
try {
  gptBrain = new GPTBrain(pool, process.env.OPENAI_API_KEY);
  console.log('✅ GPT Brain initialized');
} catch (error) {
  console.error('❌ GPT Brain failed to initialize:', error.message);
  // Create a fallback
  gptBrain = {
    buildCompleteContext: async () => ({}),
    generateResponse: async () => "Hi! How can I help you today?",
    extractInsights: async () => ({}),
    saveInsights: async () => {},
    saveMemory: async () => {}
  };
}

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
        profile_completeness INTEGER DEFAULT 0,
        age INTEGER CHECK (age >= 18 AND age <= 100),
        income_range VARCHAR(50),
        birth_date DATE,
        birth_time TIME,
        birth_place VARCHAR(200),
        life_stage VARCHAR(20),
        life_stage_flexibility VARCHAR(20) DEFAULT 'adjacent'
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
        love_language JSONB DEFAULT '{"value": null, "confidence": 0, "evidence": []}',
        attachment_style JSONB DEFAULT '{"value": null, "confidence": 0, "evidence": []}',
        conflict_style JSONB DEFAULT '{"value": null, "confidence": 0, "evidence": []}',
        lifestyle_preferences JSONB DEFAULT '{"value": null, "confidence": 0, "evidence": []}',
        values_alignment JSONB DEFAULT '{"value": null, "confidence": 0, "evidence": []}',
        emotional_needs JSONB DEFAULT '{"value": null, "confidence": 0, "evidence": []}',
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completion_percentage INTEGER DEFAULT 0,
        ready_for_matching BOOLEAN DEFAULT FALSE
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

    // Create index for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_life_stage ON users(life_stage)
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// Initialize database on startup
initializeDatabase()
  .then(() => {
    console.log('✅ Database initialization completed');
  })
  .catch(error => {
    console.error('❌ Fatal: Database initialization failed:', error);
    console.error('Error details:', error.stack);
    // Don't exit, let the app continue running
  });

// Helper Functions
function normalizePhoneNumber(phone) {
  if (!phone) return null;
  
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
  
  return '+91' + cleaned;
}

async function isPhoneAllowed(phoneNumber) {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    const result = await pool.query(
      'SELECT * FROM phone_allowlist WHERE phone_number = $1 AND status = $2',
      [normalizedPhone, 'active']
    );
    
    return result.rows.length > 0 ? result.rows[0] : false;
  } catch (error) {
    console.error('❌ Error checking phone allowlist:', error);
    return false;
  }
}

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

async function getOrCreateUserWithPhone(phoneNumber, userName, userGender, userAge) {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    const allowlistEntry = await isPhoneAllowed(normalizedPhone);
    if (!allowlistEntry) {
      throw new Error('Phone number not in allowlist');
    }
    
    await trackAllowlistAccess(normalizedPhone);
    
    const userId = 'user_' + normalizedPhone.replace(/\D/g, '');
    
    let result = await pool.query('SELECT * FROM users WHERE phone_number = $1', [normalizedPhone]);
    
    if (result.rows.length === 0) {
      const lifeStage = LifeStageManager.getLifeStage(userAge);

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
    } else {
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
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error getting/creating user with phone:', error);
    throw error;
  }
}

async function getOrCreateUser(userId) {
  try {
    let result = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    
    if (result.rows.length === 0) {
      result = await pool.query(
        'INSERT INTO users (user_id, personality_data, relationship_context, couple_compass_data) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, {}, { current_depth: 'new', topics_covered: [], comfort_level: 'getting_acquainted', intimacy_level: 0 }, {}]
      );
    } else {
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
    return result.rows.reverse();
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
    const user = await pool.query('SELECT personality_data, couple_compass_data FROM users WHERE user_id = $1', [userId]);
    const currentData = user.rows[0]?.personality_data || {};
    const currentCompassData = user.rows[0]?.couple_compass_data || {};
    
    // Merge new insights with existing data
    const updatedData = {
      ...currentData,
      ...newInsights,
      last_updated: new Date().toISOString()
    };

    // Update Couple Compass data if provided
    let updatedCompassData = currentCompassData;
    if (newInsights.couple_compass_response) {
      updatedCompassData = {
        ...currentCompassData,
        ...newInsights.couple_compass_response
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

async function getCoupleCompassProgress(userId) {
  try {
    const result = await pool.query(
      'SELECT couple_compass_data FROM users WHERE user_id = $1',
      [userId]
    );

    const answers = result.rows[0]?.couple_compass_data || {};
    const answeredQuestions = Object.keys(answers);
    const questionOrder = [
      'living_arrangement',
      'financial_style',
      'children_vision',
      'conflict_style',
      'ambition_balance',
      'big_mismatch'
    ];

    let nextQuestionIndex = 6;
    for (let i = 0; i < questionOrder.length; i++) {
      if (!answeredQuestions.includes(questionOrder[i])) {
        nextQuestionIndex = i;
        break;
      }
    }

    return {
      answers,
      answeredCount: answeredQuestions.length,
      nextQuestionIndex,
      isComplete: answeredQuestions.length >= 6
    };
  } catch (error) {
    console.error('Error getting Couple Compass progress:', error);
    return { answers: {}, answeredCount: 0, nextQuestionIndex: 0, isComplete: false };
  }
}

// PHASE 2: Couple Compass Game Implementation
class CoupleCompass {
  constructor() {
    this.questions = [
      {
        id: 'living_arrangement',
        text: "Where do you envision making a home after marriage?",
        options: [
          { value: 'with_parents', text: 'With family' },
          { value: 'near_parents', text: 'Near family, but independent' },
          { value: 'new_city', text: 'Start fresh in a new location' },
          { value: 'flexible', text: 'Open to any location' }
        ]
      },
      {
        id: 'financial_style',
        text: "How do you envision handling finances in a committed partnership?",
        options: [
          { value: 'provider', text: 'Primary provider' },
          { value: 'lead_share', text: 'Main earner, shared responsibilities' },
          { value: 'equal', text: 'Equal financial partnership' },
          { value: 'emotional', text: 'Focus on non-financial contributions' }
        ]
      },
      {
        id: 'children_vision',
        text: "What are your thoughts on having children?",
        options: [
          { value: 'yes_involved', text: 'Yes, want to be actively involved' },
          { value: 'yes_support', text: 'Yes, with shared parenting' },
          { value: 'maybe', text: 'Still undecided' },
          { value: 'no', text: 'Prefer not to have children' }
        ]
      },
      {
        id: 'conflict_style',
        text: "How do you typically handle disagreements in close relationships?",
        options: [
          { value: 'talk_out', text: 'Address immediately through discussion' },
          { value: 'need_space', text: 'Need space before discussing' },
          { value: 'mediator', text: 'Benefit from outside perspective' },
          { value: 'avoid', text: 'Tend to avoid confrontation' }
        ]
      },
      {
        id: 'ambition_balance',
        text: "What's your ideal balance between career and personal life?",
        options: [
          { value: 'high_ambition', text: 'Career-focused, ambitious goals' },
          { value: 'balanced', text: 'Success with work-life balance' },
          { value: 'family_first', text: 'Family and relationships first' },
          { value: 'simple_life', text: 'Simple, peaceful lifestyle' }
        ]
      },
      {
        id: 'big_mismatch',
        text: "How would you handle major lifestyle differences with a partner?",
        options: [
          { value: 'discuss', text: 'Openly discuss and seek compromise' },
          { value: 'unsure', text: 'Would need time to consider' },
          { value: 'mismatch', text: 'Might be incompatible' },
          { value: 'flexible', text: 'Willing to adapt for the right person' }
        ]
      }
    ];

    this.currentQuestionIndex = 0;
    this.responses = {};
  }

  getCurrentQuestion() {
    if (this.currentQuestionIndex >= this.questions.length) {
      return null;
    }
    return this.questions[this.currentQuestionIndex];
  }

  reset() {
    this.currentQuestionIndex = 0;
    this.responses = {};
  }

  generateSynthesis(userName) {
    return `${userName}, thank you for completing the Couple Compass. Your responses have given me valuable insights into what you're looking for in a partnership.

What stands out most: You're someone who values authentic connection and knows what matters to you in a relationship.

With this understanding, I can now focus on finding matches who truly align with your values and complement your vision for the future. Your authenticity in these responses will make all the difference in finding the right person.`;
  }
}

// PHASE 3: Report Generation System
class PersonalInsightReport {
  generateReport(userData, personalityData, coupleCompassData) {
    const { user_name, user_gender } = userData;
    const loveLanguage = personalityData.love_language_hints?.[0] || 'quality time';
    const attachment = personalityData.attachment_hints?.[0] || 'developing';
    
    return {
      title: `${user_name}'s Story`,
      sections: {
        introduction: `Dear ${user_name},

Over our conversations, I've had the privilege of getting to know the real you - not just what you say, but how you think, feel, and love. This report is my love letter to your beautiful complexity.`,

        personalityProfile: `**Your Personality Blueprint**

You show up in the world with a unique blend of traits that make you who you are. What makes you special is your authentic approach to relationships and life.`,

        loveStyle: `**How You Love & Need to Be Loved**

Your primary love language appears to be ${loveLanguage}. This means you feel most cherished when someone expresses love in this way.

Your attachment style leans ${attachment}, which shapes how you connect with others.`,

        relationshipStrengths: `**Your Relationship Superpowers**

Your openness and authenticity are your greatest strengths. You know yourself well and aren't afraid to be genuine.`,

        growthAreas: `**Your Growth Edges**

We all have areas where love challenges us to grow. Your journey is about continuing to be open while maintaining healthy boundaries.`,

        idealPartner: `**Who You Need By Your Side**

Based on everything you've shared, your ideal partner is someone who appreciates your authenticity and shares your values.`,

        closing: `${user_name}, you are ready for the kind of love that sees you, celebrates you, and grows with you.

Remember: The right person won't complete you - they'll complement the complete person you already are.

With love and belief in your journey,
Aria 💕`
      },
      generatedAt: new Date().toISOString()
    };
  }
}

// PHASE 4: Basic Compatibility Engine
class CompatibilityEngine {
  constructor() {
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

  checkDealbreakers(compass1, compass2) {
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
    const dealbreakCheck = this.checkDealbreakers(
      user1Data.couple_compass || {},
      user2Data.couple_compass || {}
    );

    if (dealbreakCheck.hasDealbreaker) {
      return {
        overallScore: 0,
        dimensionScores: {
          values: 0,
          emotional: 0,
          lifestyle: 0,
          lifeStage: 0
        },
        topReasons: [dealbreakCheck.reason],
        recommendation: 'Not Compatible - ' + dealbreakCheck.reason
      };
    }

    const scores = {
      values: this.calculateValueAlignment(user1Data.couple_compass, user2Data.couple_compass),
      emotional: this.calculateEmotionalFit(
        user1Data.attachment_style,
        user2Data.attachment_style,
        user1Data.love_languages || [],
        user2Data.love_languages || []
      ),
      lifestyle: this.calculateLifestyleMatch(user1Data, user2Data),
      lifeStage: this.calculateLifeStageCompatibility(user1Data, user2Data)
    };

    const overallScore = this.calculateOverallScore(scores);

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
      children_vision: {
        'yes_involved': ['yes_support'],
        'yes_support': ['yes_involved'],
        'maybe': ['maybe']
      },
      conflict_style: {
        'talk_out': ['need_space'],
        'need_space': ['talk_out', 'mediator'],
        'mediator': ['need_space', 'talk_out']
      },
      ambition_balance: {
        'high_ambition': ['balanced'],
        'balanced': ['high_ambition', 'family_first'],
        'family_first': ['balanced', 'simple_life'],
        'simple_life': ['family_first']
      },
      big_mismatch: {
        'discuss': ['flexible', 'unsure'],
        'flexible': ['discuss', 'unsure'],
        'unsure': ['discuss', 'flexible']
      }
    };

    return compatibilityMap[key]?.[value1]?.includes(value2) || false;
  }

  calculateEmotionalFit(attachment1, attachment2, loveLang1 = [], loveLang2 = []) {
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

    let loveLanguageScore = 50;

    if (loveLang1.length > 0 && loveLang2.length > 0) {
      const sharedLanguages = loveLang1.filter(lang => loveLang2.includes(lang));

      if (sharedLanguages.length >= 2) {
        loveLanguageScore = 100;
      } else if (sharedLanguages.length === 1) {
        loveLanguageScore = 85;
      } else {
        loveLanguageScore = 60;
      }
    }

    const combinedScore = (attachmentScore * 0.6) + (loveLanguageScore * 0.4);

    return Math.round(combinedScore);
  }

  calculateLifestyleMatch(user1, user2) {
    let score = 70;

    const sharedInterests = (user1.interests || []).filter(i => 
      (user2.interests || []).includes(i)
    );
    score += sharedInterests.length * 5;

    return Math.min(score, 100);
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
      values: 0.35,
      emotional: 0.25,
      lifestyle: 0.20,
      lifeStage: 0.20
    };

    let weightedScore = 0;
    Object.keys(scores).forEach(key => {
      weightedScore += scores[key] * (weights[key] || 0);
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

// Life Stage Manager
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
}

// PHASE 5: Match Profile Generator
class MatchProfileGenerator {
  generateMatchProfile(currentUser, matchUser, compatibilityData) {
    return {
      narrative: this.generateNarrativeIntroduction(currentUser, matchUser, compatibilityData),
      keyHighlights: this.generateKeyHighlights(matchUser),
      whyYouMatch: this.explainCompatibility(currentUser, matchUser, compatibilityData),
      conversationStarters: this.generateConversationStarters(currentUser, matchUser)
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

What makes this interesting? ${compatibility.topReasons[0]}`;
  }

  generateKeyHighlights(matchUser) {
    const highlights = [];
    const data = matchUser.personality_data || {};
    const compass = matchUser.couple_compass_data || {};

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

    return highlights.slice(0, 4);
  }

  explainCompatibility(currentUser, matchUser, compatibilityData) {
    const reasons = [];

    if (currentUser.couple_compass_data?.living_arrangement === matchUser.couple_compass_data?.living_arrangement) {
      reasons.push("You both envision similar living situations - that's huge for long-term harmony");
    }

    const attachmentMatch = this.assessAttachmentCompatibility(
      currentUser.personality_data?.attachment_style,
      matchUser.personality_data?.attachment_style
    );
    if (attachmentMatch) {
      reasons.push(attachmentMatch);
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
    const sharedInterests = (currentUser.personality_data?.interests || []).filter(i => 
      (matchUser.personality_data?.interests || []).includes(i)
    );

    if (sharedInterests.length > 0) {
      starters.push(`"I heard you're into ${sharedInterests[0]} too! What got you started?"`);
    }

    starters.push(`"What's been making you smile lately?"`);
    starters.push(`"I'm curious - what does your perfect Sunday look like?"`);

    return starters.slice(0, 3);
  }
}

// Helper function to save personal report
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
    console.error('❌ Error saving personal report:', error);
  }
}

// Find potential matches
async function findPotentialMatches(userId, userProfile, limit = 5) {
  try {
    const oppositeGender = userProfile.user_gender === 'Male' ? 'Female' : 'Male';
    const userLifeStage = userProfile.life_stage;
    const userChildrenPref = userProfile.couple_compass_data?.children_vision;

    const flexibility = LifeStageManager.shouldExpandFlexibility(userProfile, { couple_compass_data: {} });
    const compatibleStages = LifeStageManager.getCompatibleStages(userLifeStage, flexibility);

    const result = await pool.query(`
      SELECT * FROM users 
      WHERE user_id != $1 
      AND user_gender = $2 
      AND life_stage = ANY($3::varchar[])
      AND profile_completeness > 70
      AND couple_compass_data != '{}'
      AND NOT (
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
    const questionNumber = questionIndex + 1;
    return `Question ${questionNumber} of 6\n\n${q.text}\n\n${q.options.join('\n')}`;
  }

  return null;
}

// Helper function to calculate profile completeness
function calculateProfileCompleteness(personalityData) {
  let score = 0;
  let total = 5;
  
  if (personalityData?.love_language_hints?.length > 0) score++;
  if (personalityData?.attachment_hints?.length > 0) score++;
  if (personalityData?.values_discovered?.length > 0) score++;
  if (personalityData?.interests?.length > 0) score++;
  if (personalityData?.couple_compass_complete) score++;
  
  return Math.round((score / total) * 100);
}

// Initialize instances
const coupleCompass = new CoupleCompass();
const reportGenerator = new PersonalInsightReport();
const compatibilityEngine = new CompatibilityEngine();
const matchGenerator = new MatchProfileGenerator();

// ==================== API ENDPOINTS ====================

// Root endpoint - Railway often checks this
app.get('/', (req, res) => {
  res.json({
    message: 'SoulSync AI Backend is running',
    status: 'active',
    endpoints: {
      health: '/health',
      api: '/api/health'
    }
  });
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Phone verification endpoint
app.post('/api/verify-phone', async (req, res) => {
  try {
    const { phoneNumber, userName, userGender, userAge } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    if (!userName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name is required' 
      });
    }

    if (!userGender) {
      return res.status(400).json({ 
        success: false, 
        message: 'Gender is required' 
      });
    }

    if (!userAge || userAge < 18) {
      return res.status(400).json({ 
        success: false, 
        message: 'Age is required (must be 18 or above)' 
      });
    }
    
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const allowlistEntry = await isPhoneAllowed(normalizedPhone);
    
    if (allowlistEntry) {
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

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, userId = 'default', coupleCompassState: reqCoupleCompassState } = req.body;
    
    // Initialize variables at the top
    let gameState = null;
    let coupleCompassState = reqCoupleCompassState || null;
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured on server' });
    }

    // Get or create user profile
    const user = await getOrCreateUser(userId);
    const userName = user?.user_name || 'there';
    const conversationHistory = await getUserConversationHistory(userId);

    // Check if this is the first ever message
    const isFirstEverMessage = messages.length === 1 &&
                               messages[0].role === 'user' &&
                               user.total_conversations === 0;

    // Get the latest user message
    const latestUserMessage = messages[messages.length - 1];
    if (!latestUserMessage || latestUserMessage.role !== 'user') {
      return res.json({
        choices: [{
          message: { role: 'assistant', content: 'How can I help you today?' }
        }]
      });
    }

    // Check if user already completed Couple Compass
    const hasCompletedCoupleCompass = user.personality_data?.couple_compass_complete || false;
    const coupleCompassAnswers = user.couple_compass_data || {};
    const hasAnsweredQuestions = Object.keys(coupleCompassAnswers).length >= 6;
    const alreadyCompleted = hasCompletedCoupleCompass || hasAnsweredQuestions;

    // Detect Couple Compass acceptance
    let userAcceptedCompass = false;
    const previousMessages = messages.slice(-3);
    const ariaLastMessage = previousMessages.find(m => m.role === 'assistant')?.content || '';
    const ariaMessageLower = ariaLastMessage.toLowerCase();
    const ariaOfferedCompass = ariaMessageLower.includes('couple compass') && 
      (ariaMessageLower.includes('would you like') ||
       ariaMessageLower.includes('ready') ||
       ariaMessageLower.includes('want to try') ||
       ariaMessageLower.includes('shall we start'));

    if (ariaOfferedCompass && !alreadyCompleted && !coupleCompassState?.active) {
      const userAcceptanceWords = ['yes', 'sure', 'ok', 'okay', 'let\'s go', 'lets go', 
                                  'let\'s do it', 'lets do it', 'absolutely', 'definitely', 
                                  'yeah', 'yep', 'yup', 'start', 'begin', 'ready'];
      
      const userMessage = latestUserMessage.content.toLowerCase();
      userAcceptedCompass = userAcceptanceWords.some(word => 
        userMessage.trim() === word || 
        userMessage.includes(`${word} `) ||
        userMessage.includes(` ${word}`)
      );

      if (userAcceptedCompass) {
        coupleCompass.reset();
        const firstQuestion = coupleCompass.getCurrentQuestion();

        if (firstQuestion) {
          gameState = {
            active: true,
            questionIndex: 0,
            currentQuestion: firstQuestion,
            questionId: firstQuestion.id,
            started: true
          };

          const firstQuestionText = getCoupleCompassQuestionText(0);
          return res.json({
            choices: [{
              message: {
                role: 'assistant',
                content: `Great! Let's start the Couple Compass. This will help me understand your relationship values better.\n\n${firstQuestionText}`
              }
            }],
            userInsights: {
              coupleCompassActive: true,
              coupleCompassGameState: gameState
            }
          });
        }
      }
    }

    // Process Couple Compass answers if game is active
    if (!gameState && coupleCompassState?.active) {
      const userAnswer = latestUserMessage.content.trim().toUpperCase();
      const validAnswers = ['A', 'B', 'C', 'D'];

      if (validAnswers.includes(userAnswer)) {
        const progress = await getCoupleCompassProgress(userId);

        if (progress.isComplete) {
          coupleCompass.responses = progress.answers;

          await pool.query(`
            UPDATE users
            SET personality_data = jsonb_set(
              COALESCE(personality_data, '{}'::jsonb),
              '{couple_compass_complete}',
              'true'
            )
            WHERE user_id = $1
          `, [userId]);

          return res.json({
            choices: [{
              message: {
                role: 'assistant',
                content: coupleCompass.generateSynthesis(user.user_name)
              }
            }],
            userInsights: {
              coupleCompassComplete: true
            }
          });
        }

        const currentQuestionIndex = progress.nextQuestionIndex;
        if (currentQuestionIndex >= 6) {
          return res.json({
            choices: [{
              message: {
                role: 'assistant',
                content: "I apologize for the confusion. It looks like you've already completed all questions. Let me generate your results."
              }
            }]
          });
        }

        const currentQuestion = coupleCompass.questions[currentQuestionIndex];
        const answerIndex = validAnswers.indexOf(userAnswer);
        const selectedAnswer = currentQuestion.options[answerIndex].value;

        await pool.query(`
          UPDATE users
          SET couple_compass_data = jsonb_set(
            COALESCE(couple_compass_data, '{}'::jsonb),
            '{${currentQuestion.id}}',
            '"${selectedAnswer}"'
          )
          WHERE user_id = $1
        `, [userId]);

        const wasLastQuestion = currentQuestionIndex === 5;
        const nowComplete = progress.answeredCount + 1 >= 6;

        if (wasLastQuestion || nowComplete) {
          const finalProgress = await getCoupleCompassProgress(userId);
          coupleCompass.responses = finalProgress.answers;

          await pool.query(`
            UPDATE users
            SET personality_data = jsonb_set(
              COALESCE(personality_data, '{}'::jsonb),
              '{couple_compass_complete}',
              'true'
            )
            WHERE user_id = $1
          `, [userId]);

          return res.json({
            choices: [{
              message: {
                role: 'assistant',
                content: coupleCompass.generateSynthesis(user.user_name)
              }
            }],
            userInsights: {
              coupleCompassComplete: true
            }
          });
        }

        const nextQuestionIndex = currentQuestionIndex + 1;
        const exactQuestionText = getCoupleCompassQuestionText(nextQuestionIndex);

        return res.json({
          choices: [{
            message: {
              role: 'assistant',
              content: exactQuestionText
            }
          }],
          userInsights: {
            coupleCompassActive: true,
            coupleCompassGameState: {
              active: true,
              questionIndex: nextQuestionIndex,
              questionNumber: nextQuestionIndex + 1,
              totalQuestions: 6
            }
          }
        });
      } else {
        return res.json({
          choices: [{
            message: {
              role: 'assistant',
              content: "Please choose A, B, C, or D 😊"
            }
          }],
          userInsights: {
            coupleCompassActive: true,
            coupleCompassGameState: coupleCompassState
          }
        });
      }
    }

    // Use GPT Brain for normal conversation (when NOT in Couple Compass)
    if (!coupleCompassState?.active && !gameState?.active) {
      try {
        const context = await gptBrain.buildCompleteContext(
          userId,
          messages,
          user,
          conversationHistory
        );

        let gptResponse = await gptBrain.generateResponse(
          latestUserMessage.content,
          context
        );

        // Extract and save insights
        const insights = await gptBrain.extractInsights(
          latestUserMessage.content,
          gptResponse,
          context
        );

        await gptBrain.saveInsights(userId, insights);
        await gptBrain.saveMemory(userId, latestUserMessage.content);

        // Add greeting for returning users
        if (context.conversation.isFirstMessage && !context.user.isFirstTime) {
          gptResponse = context.temporal.greeting + ' ' + user.user_name + '! ' + gptResponse;
        }

        // Check if GPT suggested Couple Compass and update user profile
        if (gptResponse.toLowerCase().includes('couple compass') && !alreadyCompleted) {
          await updateUserProfile(userId, {
            couple_compass_invited: true
          });
        }

        // Save conversation
        await saveConversation(
          userId,
          [latestUserMessage, { role: 'assistant', content: gptResponse }],
          insights,
          `Message ${messages.length}: Natural conversation`
        );

        return res.json({
          choices: [{
            message: {
              role: 'assistant',
              content: gptResponse
            }
          }],
          userInsights: {
            userName: user.user_name,
            userGender: user.user_gender,
            profileCompleteness: calculateProfileCompleteness(user.personality_data),
            coupleCompassComplete: alreadyCompleted,
            reportAvailable: user.report_generated
          }
        });
      } catch (error) {
        console.error('GPT Brain error:', error);
        return res.json({
          choices: [{
            message: { 
              role: 'assistant', 
              content: "I'm having trouble thinking right now. Can you try again?" 
            }
          }]
        });
      }
    }

    // Default response if something goes wrong
    return res.json({
      choices: [{
        message: { 
          role: 'assistant', 
          content: 'How can I help you today?' 
        }
      }]
    });

  } catch (error) {
    console.error('Backend error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's story (personal report)
app.get('/api/user-report/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userResult = await pool.query(
      'SELECT user_name, user_gender, age, created_at FROM users WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      'SELECT * FROM personal_reports WHERE user_id = $1 ORDER BY generated_at DESC LIMIT 1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Your Story is not ready yet. Keep chatting with Aria!' });
    }

    const reportContent = result.rows[0].report_content;
    const formattedSections = {};

    Object.keys(reportContent.sections).forEach(key => {
      formattedSections[key] = reportContent.sections[key]
        .replace(/\*\*(.*?)\*\*/g, '$1')
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
    
    const userResult = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    const potentialMatches = await findPotentialMatches(userId, user);
    
    const matchProfiles = [];
    
    for (const match of potentialMatches) {
      const compatibilityData = compatibilityEngine.calculateCompatibility(
        {
          couple_compass: user.couple_compass_data,
          attachment_style: user.personality_data?.attachment_hints?.[0] || 'developing',
          interests: user.personality_data?.interests || [],
          love_languages: user.personality_data?.love_language_hints || [],
          life_stage: user.life_stage
        },
        {
          couple_compass: match.couple_compass_data,
          attachment_style: match.personality_data?.attachment_hints?.[0] || 'developing',
          interests: match.personality_data?.interests || [],
          love_languages: match.personality_data?.love_language_hints || [],
          life_stage: match.life_stage
        }
      );
      
      const matchProfile = matchGenerator.generateMatchProfile(user, match, compatibilityData);
      
      matchProfiles.push({
        matchId: match.user_id,
        matchName: match.user_name,
        compatibilityScore: compatibilityData.overallScore,
        profile: matchProfile
      });
      
      await saveMatch(userId, match.user_id, compatibilityData);
    }
    
    matchProfiles.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
    
    res.json({
      matches: matchProfiles.slice(0, 3),
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
      profileCompleteness: calculateProfileCompleteness(userData.personality_data),
      reportGenerated: userData.report_generated,
      yourStoryAvailable: userData.report_generated || false,
      coupleCompassComplete: userData.personality_data?.couple_compass_complete || false,
      loveLanguages: userData.personality_data?.love_language_hints || [],
      attachmentStyle: userData.personality_data?.attachment_hints?.[0] || 'developing'
    });
  } catch (error) {
    console.error('Error getting user insights:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin endpoints
app.post('/api/admin/add-phone', async (req, res) => {
  try {
    const { phoneNumber, userName = '', userGender = '', notes = '', adminKey } = req.body;
    
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

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT NOW()');
    const allowlistCount = await pool.query('SELECT COUNT(*) FROM phone_allowlist WHERE status = $1', ['active']);
    
    res.json({ 
      status: 'SoulSync AI - Streamlined with GPT Brain ✨',
      tagline: 'Intelligent conversations powered by GPT Brain',
      
      features_active: {
        '🧠 GPT Brain': 'Natural conversation and insight extraction',
        '🧭 Couple Compass': 'Life alignment assessment',
        '📝 Reports': 'Personal insight generation',
        '💑 Matchmaking': 'Compatibility analysis',
        '📱 Phone Verification': 'Secure access control'
      },
      
      database_connected: true,
      database_time: dbTest.rows[0].now,
      allowlist_users: allowlistCount.rows[0].count,
      allowlist_capacity: '35 users max',
      
      code_reduction: {
        original_lines: '~7000',
        current_lines: '~2400',
        reduction: '66% cleaner code',
        benefits: 'Easier maintenance, fewer bugs, better performance'
      }
    });
  } catch (error) {
    res.json({ 
      status: 'Backend running, database connection issue',
      database_connected: false,
      database_error: error.message
    });
  }
});

// Database test endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    client.release();

    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

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
      }
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({ 
      status: 'Database connection failed',
      error: error.message
    });
  }
});

setTimeout(() => {
  const PORT = process.env.PORT || 8080;
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`💕 SoulSync AI - Streamlined with GPT Brain`);
    console.log('🧠 GPT Brain: Handles all conversation intelligence');
    console.log('🧭 Couple Compass: Life alignment assessment');
    console.log('📝 Reports: Personal insights generation');
    console.log('💑 Matchmaking: Compatibility analysis');
    console.log('✨ Code Reduction: 66% cleaner, more maintainable');
    console.log(`🚀 Running on http://0.0.0.0:${PORT}`);
    console.log(`📡 Health check available at http://0.0.0.0:${PORT}/health`);
    console.log('✅ Server is now accepting connections');
  });

  // Heartbeat and process event logging
  let counter = 0;
  setInterval(() => {
    counter++;
    console.log(`⏰ Heartbeat ${counter}: Process still alive at ${new Date().toISOString()}`);
  }, 5000);

  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM from Railway');
  });

  process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT');
  });
}, 2000); // 2 second delay
process.stdin.resume();
setInterval(() => {}, 2147483647);
