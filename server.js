// SoulSync AI Backend - Enhanced with Assistant Integration
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const AssistantService = require('./services/assistant-service');
// const GPTBrain = require('./gpt-brain'); // Commented out - emergency fallback only

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
  max: 20
});

// Test database connection immediately
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection test failed:', err);
  } else {
    console.log('✅ Database connection test successful:', res.rows[0].now);
  }
});

// Initialize Assistant Service
let assistantService;
try {
  assistantService = new AssistantService(pool);
  console.log('✅ Assistant Service initialized');
} catch (error) {
  console.error('❌ Assistant Service failed to initialize:', error.message);
}

// Initialize GPT Brain as fallback (commented out)
// let gptBrain;
// try {
//   const GPTBrain = require('./gpt-brain');
//   gptBrain = new GPTBrain(pool, process.env.OPENAI_API_KEY);
//   console.log('✅ GPT Brain initialized as fallback');
// } catch (error) {
//   console.error('❌ GPT Brain initialization failed:', error.message);
// }

// Enhanced database initialization
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
        life_stage_flexibility VARCHAR(20) DEFAULT 'adjacent',
        last_extraction_message_count INTEGER DEFAULT 0
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

    // User Threads table for Assistant API integration
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_threads (
        user_id VARCHAR(255) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
        thread_id VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_message TIMESTAMP,
        message_count INTEGER DEFAULT 0,
        extracted_data JSONB DEFAULT '{}',
        last_extraction TIMESTAMP,
        extraction_count INTEGER DEFAULT 0
      )
    `);

    // Create index for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_threads_thread_id 
      ON user_threads(thread_id)
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

    // Add missing column for extraction tracking
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_extraction_message_count INTEGER DEFAULT 0
    `);

    // Ensure root level personality fields exist
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS love_languages TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS attachment_style VARCHAR(50),
      ADD COLUMN IF NOT EXISTS big_five JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS values TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}'
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

// New: Extract insights from Assistant conversation
async function extractInsightsFromAssistant(userId) {
  console.log(`🔍 Starting extraction for user ${userId} at ${new Date().toISOString()}`);
  try {
    const threadData = await pool.query(
      'SELECT thread_id, message_count FROM user_threads WHERE user_id = $1',
      [userId]
    );
    
    if (!threadData.rows[0]) {
      console.error(`❌ No thread found for user ${userId}`);
      return null;
    }

    console.log(`✅ Found thread ${threadData.rows[0].thread_id} with ${threadData.rows[0].message_count} messages`);
    
    const { thread_id, message_count } = threadData.rows[0];
    
    // Get recent messages from thread
    const messages = await assistantService.getRecentMessages(thread_id, 20);
    
    if (!messages || messages.length === 0) return null;
    
    // Format conversation for extraction
    const conversationText = messages
      .map(m => `${m.role}: ${m.content[0]?.text?.value || ''}`)
      .join('\n');
    
    // Extract insights using GPT-4 with validation and retries
    // Enhanced extraction prompt with strict format requirements
    const extractionPrompt = `You are analyzing a conversation between Aria (a relationship assistant) and a user. Extract personality insights.

CRITICAL REQUIREMENTS:
1. Use snake_case for ALL keys and string values
2. Include ALL mentioned items - don't pick just one

Required format:
{
  "love_languages": ["array_of_all_mentioned"],
  "attachment_style": "single_value",
  "big_five": {
    "openness": 0.0 to 1.0,
    "conscientiousness": 0.0 to 1.0,
    "extraversion": 0.0 to 1.0,
    "agreeableness": 0.0 to 1.0,
    "neuroticism": 0.0 to 1.0
  },
  "values": ["array_of_values"],
  "interests": ["array_of_interests"]
}

RULES:
- Valid love_languages: words_of_affirmation, quality_time, acts_of_service, physical_touch, gifts
- Valid attachment_style: secure, anxious, avoidant, disorganized
- For big_five: Include ALL 5 traits or omit the entire object
- Use snake_case for values too (e.g., "personal_growth" not "personal growth")
- If user says "acts of service and quality time", return ["acts_of_service", "quality_time"]

Example valid output:
{
  "love_languages": ["quality_time", "acts_of_service"],
  "attachment_style": "secure",
  "big_five": {
    "openness": 0.7,
    "conscientiousness": 0.5,
    "extraversion": 0.8,
    "agreeableness": 0.9,
    "neuroticism": 0.3
  },
  "values": ["family", "growth", "honesty"],
  "interests": ["cooking", "hiking", "reading"]
}`;

    // Extraction with validation and retry
    let insights = {};
    let extractionSuccessful = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const extraction = await assistantService.openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: [
            { role: 'system', content: extractionPrompt },
            { role: 'user', content: conversationText }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3
        });

        const rawInsights = JSON.parse(extraction.choices[0].message.content);

        // Validate structure
        const isValid =
          (!rawInsights.love_languages || Array.isArray(rawInsights.love_languages)) &&
          (!rawInsights.values || Array.isArray(rawInsights.values)) &&
          (!rawInsights.interests || Array.isArray(rawInsights.interests)) &&
          (!rawInsights.attachment_style || typeof rawInsights.attachment_style === 'string') &&
          (!rawInsights.big_five || (typeof rawInsights.big_five === 'object' &&
            rawInsights.big_five.openness !== undefined &&
            rawInsights.big_five.conscientiousness !== undefined &&
            rawInsights.big_five.extraversion !== undefined &&
            rawInsights.big_five.agreeableness !== undefined &&
            rawInsights.big_five.neuroticism !== undefined));

        if (isValid) {
          insights = rawInsights;
          extractionSuccessful = true;
          console.log(`✅ Extraction validated successfully on attempt ${attempt + 1}`);
          break;
        } else {
          console.error(`❌ Invalid structure on attempt ${attempt + 1}`, rawInsights);
          if (attempt < 2) {
            // Add clearer instructions for retry
            extractionPrompt += "\n\nREMINDER: Arrays must be arrays [], not objects. Use exact key names shown above. Big Five must have ALL 5 traits.";
          }
        }
      } catch (error) {
        console.error(`❌ Extraction attempt ${attempt + 1} failed:`, error);
      }
    }

    if (!extractionSuccessful) {
      console.error('❌ All extraction attempts failed');
      return null;
    }
    
    // Update database with new insights
    if (Object.keys(insights).length > 0) {
      const currentUser = await pool.query(
        'SELECT personality_data FROM users WHERE user_id = $1',
        [userId]
      );
      
      const currentData = currentUser.rows[0]?.personality_data || {};
      
      // Merge insights intelligently
      const mergedData = {
        ...currentData,
        ...insights,
        // Preserve arrays by merging
        values: [...new Set([...(currentData.values || []), ...(insights.values || [])])],
        interests: [...new Set([...(currentData.interests || []), ...(insights.interests || [])])],
        // Add extraction metadata
        last_extraction: new Date().toISOString(),
        extraction_message_count: message_count
      };
      
      await pool.query(
        'UPDATE users SET personality_data = $1, last_extraction_message_count = $2 WHERE user_id = $3',
        [JSON.stringify(mergedData), message_count, userId]
      );

      // Sync extracted data to root fields for system compatibility
      try {
        const syncedData = {
          love_languages: [],
          attachment_style: null,
          big_five: {},
          values: [],
          interests: []
        };

        // Handle NEW format (from updated extraction)
        if (mergedData.love_languages) {
          syncedData.love_languages = mergedData.love_languages;
        }
        if (mergedData.attachment_style) {
          syncedData.attachment_style = mergedData.attachment_style;
        }
        if (mergedData.big_five) {
          syncedData.big_five = mergedData.big_five;
        }
        if (mergedData.values) {
          syncedData.values = mergedData.values;
        }
        if (mergedData.interests) {
          syncedData.interests = mergedData.interests;
        }

        // Handle OLD format (for backwards compatibility)
        if (!syncedData.love_languages.length && mergedData["Love Language"]) {
          if (Array.isArray(mergedData["Love Language"])) {
            syncedData.love_languages = mergedData["Love Language"];
          } else if (typeof mergedData["Love Language"] === 'object') {
            if (mergedData["Love Language"].primary) {
              syncedData.love_languages.push(mergedData["Love Language"].primary);
            }
            if (mergedData["Love Language"].secondary) {
              syncedData.love_languages.push(mergedData["Love Language"].secondary);
            }
          }
        }

        if (!syncedData.attachment_style && mergedData["Attachment Style"]) {
          syncedData.attachment_style = mergedData["Attachment Style"];
        }

        if (Object.keys(syncedData.big_five).length === 0 && mergedData["Big Five personality traits"]) {
          syncedData.big_five = mergedData["Big Five personality traits"];
        }

        if (!syncedData.values.length) {
          syncedData.values = mergedData["Core Values"] || mergedData["Values"] || [];
        }

        if (!syncedData.interests.length) {
          syncedData.interests = mergedData["Interests / Hobbies"] || mergedData["Interests/Hobbies"] || [];
        }

        // Update root fields
        await pool.query(
          `UPDATE users 
           SET love_languages = $1,
               attachment_style = $2,
               big_five = $3,
               values = $4,
               interests = $5
           WHERE user_id = $6`,
          [
            syncedData.love_languages,
            syncedData.attachment_style,
            syncedData.big_five,
            syncedData.values,
            syncedData.interests,
            userId
          ]
        );

        console.log(`✅ Synced extraction data to root fields for user ${userId}`);
        console.log('Synced data:', JSON.stringify(syncedData, null, 2));
      } catch (syncError) {
        console.error(`❌ Failed to sync extraction data for user ${userId}:`, syncError);
        // Don't throw - extraction succeeded even if sync fails
      }
      
      // Update extraction tracking
      await pool.query(
        'UPDATE user_threads SET last_extraction = NOW() WHERE user_id = $1',
        [userId]
      );
      
      console.log(`✅ Extracted insights for user ${userId}:`, insights);

      // Check if report can be generated after extraction
      setTimeout(async () => {
        try {
          const reportGenerated = await checkReportReadiness(userId);
          if (reportGenerated) {
            console.log(`🎉 Report auto-generated after extraction for user ${userId}`);
          }
        } catch (error) {
          console.error('Error checking report after extraction:', error);
        }
      }, 2000); // Small delay to ensure all data is saved

      return insights;
    }
    
    return null;
  } catch (error) {
    console.error(`❌ Extraction failed for user ${userId}:`, error);
    console.error('Error details:', error.response?.data || error.message);
    return null;
  }
}

// Check if it's time to extract insights
async function shouldExtractInsights(userId) {
  try {
    const result = await pool.query(
      `SELECT 
        ut.message_count, 
        ut.created_at,
        u.last_extraction_message_count,
        ut.thread_id
       FROM user_threads ut 
       JOIN users u ON ut.user_id = u.user_id 
       WHERE ut.user_id = $1`,
      [userId]
    );

    if (!result.rows[0]) {
      console.log(`No thread found for user ${userId}`);
      return false;
    }

    const { message_count, created_at, last_extraction_message_count, thread_id } = result.rows[0];
    const messagesSinceExtraction = message_count - (last_extraction_message_count || 0);
    const conversationDuration = Date.now() - new Date(created_at).getTime();

    // Extract after 15 messages OR 15 minutes
    const shouldExtract = messagesSinceExtraction >= 15 || conversationDuration > 15 * 60 * 1000;

    if (shouldExtract) {
      console.log(`Extraction triggered for ${userId}: ${messagesSinceExtraction} messages, ${Math.round(conversationDuration/60000)} minutes`);
    }

    return shouldExtract;
  } catch (error) {
    console.error('Error checking extraction timing:', error);
    return false;
  }
}

// Check if ready for Couple Compass
async function checkCompassReadiness(userId) {
  try {
    const user = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    const userData = user.rows[0];
    const personalityData = userData.personality_data || {};
    
    // Check if already completed
    if (personalityData.couple_compass_complete || Object.keys(userData.couple_compass_data || {}).length >= 6) {
      return { ready: false, reason: 'already_completed' };
    }
    
    // Check minimum requirements
    const hasLoveLanguage = personalityData["Love Language"] || userData.love_languages?.length > 0;
    const hasAttachment = personalityData["Attachment Style"] || userData.attachment_style;
    const hasBigFive = (personalityData["Big Five personality traits"] && Object.keys(personalityData["Big Five personality traits"]).length >= 3) || 
                       (userData.big_five && Object.keys(userData.big_five).length >= 3); // At least 3 traits
    const hasValues = personalityData["Values"]?.length > 0 || 
                      personalityData["Core Values"]?.length > 0 || 
                      userData.values?.length > 0;
    
    // Check message count
    const threadData = await pool.query('SELECT message_count FROM user_threads WHERE user_id = $1', [userId]);
    const messageCount = threadData.rows[0]?.message_count || 0;
    
    const ready = hasLoveLanguage && hasAttachment && (hasBigFive || hasValues) && messageCount >= 8;
    
    return {
      ready,
      reason: ready ? 'all_criteria_met' : 'needs_more_conversation',
      details: {
        hasLoveLanguage,
        hasAttachment,
        hasBigFive,
        hasValues,
        messageCount,
        minimumMessages: 8
      }
    };
  } catch (error) {
    console.error('Error checking Compass readiness:', error);
    return { ready: false, reason: 'error' };
  }
}

// Check if enough data is available to generate the personal report
async function checkReportReadiness(userId) {
  try {
    const user = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    const userData = user.rows[0];
    const personalityData = userData.personality_data || {};
    const coupleCompassData = userData.couple_compass_data || {};

    // Check if report already generated
    if (userData.report_generated) {
      console.log(`Report already generated for user ${userId}`);
      return false;
    }

    // Check minimum requirements - look in BOTH root fields and personality_data
    const hasLoveLanguage =
      (userData.love_languages && userData.love_languages.length > 0) ||
      personalityData["Love Language"] ||
      personalityData.love_language ||
      personalityData.love_languages?.length > 0 ||
      personalityData.love_language_hints?.length > 0;

    const hasValues =
      (userData.values && userData.values.length > 0) ||
      personalityData["Values"]?.length > 0 ||
      personalityData["Core Values"]?.length > 0 ||
      personalityData.values?.length > 0 ||
      personalityData.values_discovered?.length > 0;

    const hasCompass =
      personalityData.couple_compass_complete ||
      Object.keys(coupleCompassData).length >= 6;

    console.log(`Report readiness check for ${userId}:`, {
      hasLoveLanguage,
      hasValues,
      hasCompass,
      ready: hasLoveLanguage && hasValues && hasCompass
    });

    if (hasLoveLanguage && hasValues && hasCompass) {
      const reportData = {
        ...userData,
        personality_data: {
          ...personalityData,
          love_language: userData.love_languages?.[0] || personalityData["Love Language"] || personalityData.love_language,
          attachment_style: userData.attachment_style || personalityData["Attachment Style"] || personalityData.attachment_style,
          big_five: userData.big_five || personalityData["Big Five personality traits"] || personalityData.big_five || {},
          values: userData.values || personalityData["Values"] || personalityData["Core Values"] || personalityData.values || [],
          interests: userData.interests || personalityData["Interests/Hobbies"] || personalityData["Interests / Hobbies"] || personalityData.interests || []
        }
      };

      const report = reportGenerator.generateReport(
        userData,
        reportData.personality_data,
        coupleCompassData
      );

      await savePersonalReport(userId, report);

      await pool.query(
        'UPDATE users SET report_generated = TRUE WHERE user_id = $1',
        [userId]
      );

      console.log(`✅ Report generated successfully for user ${userId}`);
      return true;
    }

    console.log(`Report not ready for user ${userId} - missing required data`);
    return false;
  } catch (error) {
    console.error('Error checking report readiness:', error);
    return false;
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
    const loveLanguage = personalityData.love_language || personalityData.love_language_hints?.[0] || 'quality time';
    const attachment = personalityData.attachment_style || personalityData.attachment_hints?.[0] || 'developing';
    const bigFive = personalityData.big_five || {};
    
    // Generate personality description based on Big Five
    const personalityDescription = this.generatePersonalityDescription(bigFive);
    
    return {
      title: `${user_name}'s Story`,
      sections: {
        introduction: `Dear ${user_name},

Over our conversations, I've had the privilege of getting to know the real you - not just what you say, but how you think, feel, and love. This report is my love letter to your beautiful complexity.`,

        personalityProfile: `**Your Personality Blueprint**

${personalityDescription}

You show up in the world with a unique blend of traits that make you who you are. What makes you special is your authentic approach to relationships and life.`,

        loveStyle: `**How You Love & Need to Be Loved**

Your primary love language appears to be ${this.formatLoveLanguage(loveLanguage)}. This means you feel most cherished when someone expresses love in this way.

Your attachment style leans ${attachment}, which shapes how you connect with others. ${this.getAttachmentDescription(attachment)}`,

        relationshipStrengths: `**Your Relationship Superpowers**

${this.generateStrengths(personalityData, bigFive)}

Your openness and authenticity are your greatest strengths. You know yourself well and aren't afraid to be genuine.`,

        growthAreas: `**Your Growth Edges**

We all have areas where love challenges us to grow. ${this.generateGrowthAreas(bigFive, attachment)}`,

        idealPartner: `**Who You Need By Your Side**

Based on everything you've shared, your ideal partner is someone who ${this.generateIdealPartner(personalityData, coupleCompassData, bigFive)}.`,

        closing: `${user_name}, you are ready for the kind of love that sees you, celebrates you, and grows with you.

Remember: The right person won't complete you - they'll complement the complete person you already are.

With love and belief in your journey,
Aria 💕`
      },
      generatedAt: new Date().toISOString()
    };
  }

  generatePersonalityDescription(bigFive) {
    let description = [];
    
    if (bigFive.openness > 0.7) {
      description.push("You're a creative soul who loves exploring new ideas and experiences");
    } else if (bigFive.openness < 0.3) {
      description.push("You appreciate tradition and find comfort in the familiar");
    }
    
    if (bigFive.conscientiousness > 0.7) {
      description.push("Your organized and reliable nature makes others feel secure");
    }
    
    if (bigFive.extraversion > 0.6) {
      description.push("Your social energy lights up any room you enter");
    } else if (bigFive.extraversion < 0.4) {
      description.push("You have a quiet strength and prefer deep connections over large gatherings");
    }
    
    if (bigFive.agreeableness > 0.7) {
      description.push("Your compassionate heart naturally draws people to you");
    }
    
    if (bigFive.neuroticism < 0.3) {
      description.push("You have an admirable emotional stability that helps you weather life's storms");
    }
    
    return description.join(". ") || "You have a balanced personality that adapts well to different situations.";
  }

  formatLoveLanguage(language) {
    const formats = {
      'words_of_affirmation': 'words of affirmation - hearing "I love you" and receiving compliments',
      'quality_time': 'quality time - undivided attention and meaningful conversations',
      'acts_of_service': 'acts of service - when someone does thoughtful things to help you',
      'physical_touch': 'physical touch - hugs, holding hands, and physical closeness',
      'gifts': 'receiving gifts - thoughtful presents that show someone was thinking of you'
    };
    return formats[language] || language;
  }

  getAttachmentDescription(style) {
    const descriptions = {
      'secure': 'This means you are comfortable with intimacy and independence in healthy balance.',
      'anxious': 'This means you deeply value closeness and may need extra reassurance in relationships.',
      'avoidant': 'This means you value your independence and may take time to open up fully.',
      'disorganized': 'This means you may have complex feelings about closeness and distance.',
      'developing': 'This is still developing as we learn more about your relationship patterns.'
    };
    return descriptions[style] || '';
  }

  generateStrengths(personalityData, bigFive) {
    const strengths = [];
    
    if (bigFive.agreeableness > 0.6) {
      strengths.push("Your empathy allows you to truly understand your partner's feelings");
    }
    
    if (bigFive.conscientiousness > 0.6) {
      strengths.push("You're someone a partner can count on - reliable and true to your word");
    }
    
    if (personalityData.values?.includes('honesty')) {
      strengths.push("Your commitment to honesty creates a foundation of trust");
    }
    
    return strengths.join(".\n\n") || "Your unique combination of traits creates a strong foundation for lasting love.";
  }

  generateGrowthAreas(bigFive, attachment) {
    if (attachment === 'anxious') {
      return "Your journey is about trusting in love's permanence and giving your partner space to miss you.";
    }
    
    if (attachment === 'avoidant') {
      return "Your journey is about allowing yourself to be vulnerable and letting someone truly see you.";
    }
    
    if (bigFive.neuroticism > 0.7) {
      return "Your journey is about finding inner calm and not letting worry overshadow love's joy.";
    }
    
    return "Your journey is about continuing to be open while maintaining healthy boundaries.";
  }

  generateIdealPartner(personalityData, coupleCompassData, bigFive) {
    const traits = [];
    
    if (personalityData.love_language === 'quality_time') {
      traits.push("prioritizes spending meaningful time with you");
    }
    
    if (coupleCompassData.conflict_style === 'talk_out') {
      traits.push("communicates openly when challenges arise");
    }
    
    if (bigFive.extraversion < 0.4) {
      traits.push("respects your need for quiet moments");
    }
    
    if (personalityData.values?.includes('family')) {
      traits.push("shares your vision of family");
    }
    
    return traits.join(", ") || "appreciates your authenticity and shares your core values";
  }
}

// PHASE 4: Enhanced Compatibility Engine with Big Five
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
          lifeStage: 0,
          personality: 0
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
      lifeStage: this.calculateLifeStageCompatibility(user1Data, user2Data),
      personality: this.calculateBigFiveMatch(user1Data.big_five, user2Data.big_five)
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

  calculateBigFiveMatch(bigFive1, bigFive2) {
    if (!bigFive1 || !bigFive2) return 50;
    
    let totalScore = 0;
    const weights = {
      openness: 0.2,          // Similar creativity levels preferred
      conscientiousness: 0.2,  // Similar organization preferred
      extraversion: 0.2,       // Complementary can work
      agreeableness: 0.25,     // Similar empathy levels important
      neuroticism: 0.15        // Low combined score preferred
    };
    
    Object.keys(weights).forEach(trait => {
      const value1 = bigFive1[trait] || 0.5;
      const value2 = bigFive2[trait] || 0.5;
      const diff = Math.abs(value1 - value2);
      
      if (trait === 'extraversion') {
        // Complementary can be good for extraversion
        const score = (diff > 0.3 && diff < 0.7) ? 100 : (1 - diff) * 100;
        totalScore += score * weights[trait];
      } else if (trait === 'neuroticism') {
        // Low combined neuroticism is best
        const combined = value1 + value2;
        const score = combined < 1 ? 100 : Math.max(0, (2 - combined) * 50);
        totalScore += score * weights[trait];
      } else {
        // For other traits, similar is better
        totalScore += (1 - diff) * 100 * weights[trait];
      }
    });
    
    return Math.round(totalScore);
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
      values: 0.30,
      emotional: 0.20,
      lifestyle: 0.15,
      lifeStage: 0.15,
      personality: 0.20
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

    if (scores.personality > 80) {
      reasons.push("Your personalities create a beautiful balance");
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

// Life Stage Manager (unchanged)
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

// PHASE 5: Match Profile Generator (enhanced with Big Five)
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
    const bigFive = data.big_five || {};

    const lifeStageLabel = LifeStageManager.getLifeStageLabel(matchUser.life_stage);
    const lifeStageEmoji = LifeStageManager.getLifeStageEmoji(matchUser.life_stage);
    highlights.push(`${lifeStageEmoji} ${lifeStageLabel}`);

    if (data.love_language === 'quality_time' || data.love_language_hints?.includes('quality_time')) {
      highlights.push("📱 Will put their phone away when they're with you");
    }

    if (compass.children_vision === 'yes_involved') {
      highlights.push("👶 Ready to be a hands-on parent someday");
    }

    if (compass.financial_style === 'equal') {
      highlights.push("💰 Believes in true 50-50 partnership");
    }

    if (bigFive.openness > 0.7) {
      highlights.push("🎨 Creative soul who loves trying new things");
    }

    if (bigFive.conscientiousness > 0.7) {
      highlights.push("📅 Organized and keeps their promises");
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

    // Add Big Five compatibility insight
    const currentBig5 = currentUser.personality_data?.big_five || {};
    const matchBig5 = matchUser.personality_data?.big_five || {};
    
    if (currentBig5.extraversion && matchBig5.extraversion) {
      const diff = Math.abs(currentBig5.extraversion - matchBig5.extraversion);
      if (diff > 0.4) {
        reasons.push("Your different social energies could create a perfect balance - one brings adventure, the other brings calm");
      }
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
  let total = 6;

  // Check both personality_data fields and root fields
  if (personalityData?.["Love Language"] || personalityData?.love_languages?.length > 0) score++;
  if (personalityData?.["Attachment Style"] || personalityData?.attachment_style) score++;
  if ((personalityData?.["Core Values"] && personalityData["Core Values"].length > 0) || 
      (personalityData?.["Values"] && personalityData["Values"].length > 0) || 
      (personalityData?.values && personalityData.values.length > 0)) score++;
  if ((personalityData?.["Interests / Hobbies"] && personalityData["Interests / Hobbies"].length > 0) || 
      (personalityData?.["Interests/Hobbies"] && personalityData["Interests/Hobbies"].length > 0) || 
      (personalityData?.interests && personalityData.interests.length > 0)) score++;
  if (personalityData?.couple_compass_complete) score++;
  if (personalityData?.["Big Five personality traits"] || personalityData?.big_five) score++;

  return Math.round((score / total) * 100);
}

// Initialize instances
const coupleCompass = new CoupleCompass();
const reportGenerator = new PersonalInsightReport();
const compatibilityEngine = new CompatibilityEngine();
const matchGenerator = new MatchProfileGenerator();

// ==================== API ENDPOINTS ====================

// Root endpoint
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

// Health check endpoint
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

// Main chat endpoint - ENHANCED WITH ASSISTANT
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, userId = 'default', coupleCompassState: reqCoupleCompassState } = req.body;
    
    // Initialize variables
    let gameState = null;
    let coupleCompassState = reqCoupleCompassState || null;
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured on server' });
    }

    if (!assistantService) {
      return res.status(500).json({ error: 'Assistant service not initialized' });
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

    if (alreadyCompleted && !gameState && !coupleCompassState?.active) {
      coupleCompassState = { active: false };
    }

    // Detect Couple Compass acceptance
    let userAcceptedCompass = false;
    const previousMessages = messages.slice(-3);
    const ariaLastMessage = previousMessages.find(m => m.role === 'assistant')?.content || '';
    const ariaMessageLower = ariaLastMessage.toLowerCase();
    const ariaOfferedCompass = (ariaMessageLower.includes('couple compass') || 
                                ariaMessageLower.includes('[compass_ready]')) && 
      (ariaMessageLower.includes('would you like') ||
       ariaMessageLower.includes('ready') ||
       ariaMessageLower.includes('want to try') ||
       ariaMessageLower.includes('shall we start') ||
       ariaMessageLower.includes('you in?'));

    if (ariaOfferedCompass && !alreadyCompleted && !coupleCompassState?.active) {
      const userAcceptanceWords = ['yes', 'sure', 'ok', 'okay', 'let\'s go', 'lets go', 
                                  'let\'s do it', 'lets do it', 'absolutely', 'definitely', 
                                  'yeah', 'yep', 'yup', 'start', 'begin', 'ready', 'sounds good',
                                  'sounds fun', "i'm in", 'im in'];
      
      const userMessage = latestUserMessage.content.toLowerCase();
      userAcceptedCompass = userAcceptanceWords.some(word => 
        userMessage.trim() === word || 
        userMessage.includes(`${word} `) ||
        userMessage.includes(` ${word}`) ||
        userMessage === word
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

        const currentQuestionIndex = progress.nextQuestionIndex;
        if (currentQuestionIndex >= 6 || progress.isComplete) {
          // Mark as complete
          await pool.query(`
            UPDATE users
            SET personality_data = jsonb_set(
              COALESCE(personality_data, '{}'::jsonb),
              '{couple_compass_complete}',
              'true'
            )
            WHERE user_id = $1
          `, [userId]);

          // Check if report can be generated after Couple Compass completion
          setTimeout(async () => {
            try {
              const reportGenerated = await checkReportReadiness(userId);
              if (reportGenerated) {
                console.log(`🎉 Report auto-generated after Couple Compass for user ${userId}`);
              }
            } catch (error) {
              console.error('Error checking report after Couple Compass:', error);
            }
          }, 2000); // Small delay to ensure all data is saved

          // Send completion info to Assistant thread
          try {
            const threadId = await assistantService.getOrCreateThread(userId);
            const compassSummary = `[SYSTEM: User just completed Couple Compass with these preferences: 
              Living: ${coupleCompassAnswers.living_arrangement || 'not specified'},
              Finances: ${coupleCompassAnswers.financial_style || 'not specified'},
              Children: ${coupleCompassAnswers.children_vision || 'not specified'},
              Conflict: ${coupleCompassAnswers.conflict_style || 'not specified'},
              Career Balance: ${coupleCompassAnswers.ambition_balance || 'not specified'},
              Flexibility: ${coupleCompassAnswers.big_mismatch || 'not specified'}]`;
            
            await assistantService.openai.beta.threads.messages.create(threadId, {
              role: 'user',
              content: compassSummary
            });
          } catch (error) {
            console.error('Error updating Assistant thread:', error);
          }

          const reportReady = await checkReportReadiness(userId);

          return res.json({
            choices: [{
              message: {
                role: 'assistant',
                content: coupleCompass.generateSynthesis(user.user_name)
              }
            }],
            userInsights: {
              coupleCompassComplete: true,
              coupleCompassActive: false,
              reportAvailable: reportReady,
              detectedMood: '',
              currentInterests: []
            }
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

          // Send completion to Assistant
          try {
            const threadId = await assistantService.getOrCreateThread(userId);
            const finalAnswers = finalProgress.answers;
            const compassSummary = `[SYSTEM: User just completed Couple Compass with preferences for:
              Living: ${finalAnswers.living_arrangement},
              Finances: ${finalAnswers.financial_style},
              Children: ${finalAnswers.children_vision},
              Conflict: ${finalAnswers.conflict_style},
              Career: ${finalAnswers.ambition_balance},
              Flexibility: ${finalAnswers.big_mismatch}]`;
            
            await assistantService.openai.beta.threads.messages.create(threadId, {
              role: 'user',
              content: compassSummary
            });
          } catch (error) {
            console.error('Error updating Assistant thread:', error);
          }

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

    // Use Assistant for normal conversation (when NOT in Couple Compass)
    if (!coupleCompassState?.active && !gameState?.active) {
      try {
        // Send message to Assistant
        const assistantResponse = await assistantService.sendMessage(userId, latestUserMessage.content);
        
        // Check if it's time to extract insights
        if (await shouldExtractInsights(userId)) {
          // Run extraction in background
          extractInsightsFromAssistant(userId).catch(error => {
            console.error('Background extraction failed:', error);
          });
        }
        
        // Check if Assistant is suggesting Couple Compass
        const compassReadiness = await checkCompassReadiness(userId);
        let finalResponse = assistantResponse;
        
        if (compassReadiness.ready && !alreadyCompleted) {
          // Check if Assistant naturally mentioned Couple Compass
          if (!assistantResponse.toLowerCase().includes('couple compass')) {
            // Add natural transition
            finalResponse = assistantResponse + '\n\n[COMPASS_READY]';
          }
        }
        
        // Save conversation
        await saveConversation(
          userId,
          [latestUserMessage, { role: 'assistant', content: finalResponse }],
          {},
          `Message ${messages.length}: Assistant conversation`
        );

        const reportReady = await checkReportReadiness(userId);

        return res.json({
          choices: [{
            message: {
              role: 'assistant',
              content: finalResponse.replace('[COMPASS_READY]', "By the way, I think I'm getting to know you pretty well now! Would you like to try something fun? It's called the Couple Compass - just 6 quick questions that help me understand exactly what you're looking for in a partner. You in? 🧭")
            }
          }],
          userInsights: {
            userName: user.user_name,
            userGender: user.user_gender,
            profileCompleteness: calculateProfileCompleteness(user.personality_data),
            coupleCompassComplete: alreadyCompleted,
            reportAvailable: reportReady || user.report_generated,
            detectedMood: '',
            currentInterests: []
          }
        });
      } catch (error) {
        console.error('Assistant error:', error);
        
        // Emergency fallback - could uncomment GPT Brain here
        // if (gptBrain) {
        //   const context = await gptBrain.buildCompleteContext(userId, messages, user, conversationHistory);
        //   const gptResponse = await gptBrain.generateResponse(latestUserMessage.content, context);
        //   // ... handle GPT response ...
        // }
        
        return res.json({
          choices: [{
            message: { 
              role: 'assistant', 
              content: "I'm having a bit of trouble right now. Can you try again? 😊" 
            }
          }]
        });
      }
    }

    // Default response
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

// New endpoint: Manual insight extraction
app.post('/api/extract-insights/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const insights = await extractInsightsFromAssistant(userId);
    
    if (insights) {
      res.json({
        success: true,
        insights: insights,
        message: 'Insights extracted successfully'
      });
    } else {
      res.json({
        success: false,
        message: 'No new insights found'
      });
    }
  } catch (error) {
    console.error('Manual extraction error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Extraction failed' 
    });
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
    const userData = user.personality_data || {};
    
    const potentialMatches = await findPotentialMatches(userId, user);
    
    const matchProfiles = [];
    
    for (const match of potentialMatches) {
      const matchData = match.personality_data || {};
      
      const compatibilityData = compatibilityEngine.calculateCompatibility(
        {
          couple_compass: user.couple_compass_data,
          attachment_style: userData.attachment_style || userData.attachment_hints?.[0] || 'developing',
          interests: userData.interests || [],
          love_languages: userData.love_language ? [userData.love_language] : (userData.love_language_hints || []),
          life_stage: user.life_stage,
          big_five: userData.big_five || {}
        },
        {
          couple_compass: match.couple_compass_data,
          attachment_style: matchData.attachment_style || matchData.attachment_hints?.[0] || 'developing',
          interests: matchData.interests || [],
          love_languages: matchData.love_language ? [matchData.love_language] : (matchData.love_language_hints || []),
          life_stage: match.life_stage,
          big_five: matchData.big_five || {}
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
    const personalityData = userData.personality_data || {};
    
    res.json({
      userId: userData.user_id,
      userName: userData.user_name,
      userGender: userData.user_gender,
      phoneNumber: userData.phone_number,
      createdAt: userData.created_at,
      lastSeen: userData.last_seen,
      personalityData: personalityData,
      coupleCompassData: userData.couple_compass_data,
      relationshipContext: userData.relationship_context,
      conversationCount: conversations.length,
      totalConversations: userData.total_conversations,
      profileCompleteness: calculateProfileCompleteness(userData),
      reportGenerated: userData.report_generated,
      yourStoryAvailable: userData.report_generated || false,
      coupleCompassComplete: personalityData.couple_compass_complete || false,
      loveLanguages: userData.love_languages || [],
      attachmentStyle: userData.attachment_style || 'developing',
      bigFive: userData.big_five || {},
      values: userData.values || [],
      interests: userData.interests || []
    });
  } catch (error) {
    console.error('Error getting user insights:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manual report generation endpoint - for users who should have reports but don't
app.post('/api/generate-report/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if report already exists
    if (user.rows[0].report_generated) {
      return res.json({
        success: false,
        message: 'Report already generated',
        reportAvailable: true
      });
    }

    // Try to generate report
    const reportGenerated = await checkReportReadiness(userId);

    if (reportGenerated) {
      res.json({
        success: true,
        message: 'Report generated successfully',
        reportAvailable: true
      });
    } else {
      // Provide detailed reason why report can't be generated
      const userData = user.rows[0];
      const personalityData = userData.personality_data || {};
      const coupleCompassData = userData.couple_compass_data || {};

      const missingItems = [];
      if (!userData.love_languages?.length && !personalityData["Love Language"]) {
        missingItems.push('Love Language data');
      }
      if (!userData.values?.length && !personalityData["Values"]?.length) {
        missingItems.push('Values data');
      }
      if (!personalityData.couple_compass_complete && Object.keys(coupleCompassData).length < 6) {
        missingItems.push('Couple Compass completion');
      }

      res.json({
        success: false,
        message: 'Insufficient data for report generation',
        missing: missingItems,
        reportAvailable: false
      });
    }
  } catch (error) {
    console.error('Manual report generation error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
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
    
    if (currentCount >= 75) {
      return res.status(400).json({
        message: 'Allowlist is full (75/75). Remove a number first.'
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
      remaining: 74 - currentCount
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
      available: 75 - currentCount
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
        u.profile_completeness,
        ut.message_count,
        ut.last_extraction
      FROM phone_allowlist al
      LEFT JOIN users u ON al.phone_number = u.phone_number
      LEFT JOIN user_threads ut ON u.user_id = ut.user_id
      WHERE al.status = 'active'
      ORDER BY al.added_at DESC
    `);
    
    const totalCount = allowlistResult.rows.length;
    const available = 75 - totalCount;
    
    res.json({
      totalAllowed: totalCount,
      maxCapacity: 75,
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
        assistantMessages: row.message_count || 0,
        lastExtraction: row.last_extraction,
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
    const assistantStatus = assistantService ? 'Connected' : 'Not initialized';
    
    res.json({ 
      status: 'SoulSync AI - Enhanced with Assistant Integration ✨',
      tagline: 'Natural conversations powered by OpenAI Assistant',
      
      features_active: {
        '🤖 Assistant': assistantStatus,
        '🧠 Smart Extraction': 'Every 5 messages',
        '🧭 Couple Compass': 'Intelligent triggering',
        '📝 Enhanced Reports': 'With Big Five insights',
        '💑 Smart Matching': 'Personality-based compatibility',
        '📱 Phone Verification': 'Secure access control'
      },
      
      database_connected: true,
      database_time: dbTest.rows[0].now,
      allowlist_users: allowlistCount.rows[0].count,
      allowlist_capacity: '75 users max',
      
      integration_status: {
        assistant_api: assistantStatus,
        extraction_enabled: true,
        big_five_support: true,
        gpt_brain_fallback: 'Available (commented out)'
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
    const threadCount = await pool.query('SELECT COUNT(*) FROM user_threads');

    res.json({
      status: 'Database connection successful! 🎉',
      database_info: {
        connected: true,
        current_time: result.rows[0].current_time,
        tables_created: tablesResult.rows.map(row => row.table_name),
        allowlist_users: allowlistCount.rows[0].count,
        total_users: userCount.rows[0].count,
        assistant_threads: threadCount.rows[0].count,
        allowlist_capacity: '75 users max'
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

// Start server with delay
setTimeout(() => {
  const PORT = process.env.PORT || 8080;
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`💕 SoulSync AI - Enhanced with Assistant Integration`);
    console.log('🤖 Assistant: Natural conversation memory');
    console.log('🧠 Extraction: Insights every 5 messages');
    console.log('🧭 Couple Compass: Smart triggering when ready');
    console.log('📝 Reports: Enhanced with Big Five personality');
    console.log('💑 Matching: Smarter compatibility with personality');
    console.log(`🚀 Running on http://0.0.0.0:${PORT}`);
    console.log(`📡 Health check available at http://0.0.0.0:${PORT}/health`);
    console.log('✅ Server is now accepting connections');
  });

  // Heartbeat logging
  let counter = 0;
  setInterval(() => {
    counter++;
    console.log(`⏰ Heartbeat ${counter}: Process alive at ${new Date().toISOString()}`);
  }, 300000); // Every 5 minutes

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
