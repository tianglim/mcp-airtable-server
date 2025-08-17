const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

// Configuration from environment variables
const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;
const MCP_SERVER_SECRET = process.env.MCP_SERVER_SECRET;
const PORT = process.env.PORT || 3000;

console.log('Starting HTTP MCP Airtable Server...');

if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME || !MCP_SERVER_SECRET) {
  console.error('Missing required environment variables');
  console.error('Required: AIRTABLE_API_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME, MCP_SERVER_SECRET');
  process.exit(1);
}

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Authentication middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${MCP_SERVER_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Tool definitions
const tools = [
  {
    name: 'airtable_get_records',
    description: 'Get records from Airtable table',
    inputSchema: {
      type: 'object',
      properties: {
        maxRecords: { type: 'number', default: 10 },
        filterByFormula: { type: 'string' },
        view: { type: 'string' }
      }
    }
  },
  {
    name: 'airtable_create_record',
    description: 'Create a new record in Airtable table',
    inputSchema: {
      type: 'object',
      properties: {
        fields: { type: 'object' }
      },
      required: ['fields']
    }
  },
  {
    name: 'airtable_update_record',
    description: 'Update an existing record in Airtable table',
    inputSchema: {
      type: 'object',
      properties: {
        recordId: { type: 'string' },
        fields: { type: 'object' }
      },
      required: ['recordId', 'fields']
    }
  },
  {
    name: 'airtable_delete_record',
    description: 'Delete a record from Airtable table',
    inputSchema: {
      type: 'object',
      properties: {
        recordId: { type: 'string' }
      },
      required: ['recordId']
    }
  }
];

// HTTP endpoints
app.get('/', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'HTTP MCP Airtable Server',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString() 
  });
});

app.get('/tools', authenticate, (req, res) => {
  res.json({ tools });
});

app.post('/tools/:toolName', authenticate, async (req, res) => {
  const { toolName } = req.params;
  const args = req.body;

  try {
    const result = await executeAirtableTool(toolName, args);
    res.json(result);
  } catch (error) {
    console.error(`Error executing ${toolName}:`, error);
    res.status(500).json({ 
      error: error.message,
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true
    });
  }
});

// Tool execution function
async function executeAirtableTool(toolName, args) {
  try {
    switch (toolName) {
      case 'airtable_get_records':
        return await getRecords(args);
      case 'airtable_create_record':
        return await createRecord(args);
      case 'airtable_update_record':
        return await updateRecord(args);
      case 'airtable_delete_record':
        return await deleteRecord(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true
    };
  }
}

// Airtable API functions
async function getRecords(args) {
  const params = { maxRecords: args.maxRecords || 10 };
  if (args.filterByFormula) params.filterByFormula = args.filterByFormula;
  if (args.view) params.view = args.view;

  const response = await axios.get(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`,
    {
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_TOKEN}` },
      params
    }
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
  };
}

async function createRecord(args) {
  const response = await axios.post(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`,
    { fields: args.fields },
    {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return {
    content: [{ type: 'text', text: `Record created: ${JSON.stringify(response.data, null, 2)}` }]
  };
}

async function updateRecord(args) {
  const response = await axios.patch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${args.recordId}`,
    { fields: args.fields },
    {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return {
    content: [{ type: 'text', text: `Record updated: ${JSON.stringify(response.data, null, 2)}` }]
  };
}

async function deleteRecord(args) {
  const response = await axios.delete(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${args.recordId}`,
    {
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_TOKEN}` }
    }
  );

  return {
    content: [{ type: 'text', text: `Record deleted: ${JSON.stringify(response.data, null, 2)}` }]
  };
}

// Start HTTP server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Test with: curl http://localhost:${PORT}/health`);
});

// Debug endpoint to check environment variables
app.get('/debug', (req, res) => {
  res.json({ 
    hasSecret: !!MCP_SERVER_SECRET,
    secretLength: MCP_SERVER_SECRET ? MCP_SERVER_SECRET.length : 0,
    secretPreview: MCP_SERVER_SECRET ? MCP_SERVER_SECRET.substring(0, 5) + '...' : 'undefined'
  });
});