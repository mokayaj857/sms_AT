require('dotenv').config();
const express = require('express');
const africastalking_api = require('africastalking');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

// Verify required environment variables
const requiredEnvVars = ['AFRICASTALKING_API_KEY', 'AFRICASTALKING_USERNAME'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize Africastalking client
const africastalking = africastalking_api({
  apiKey: process.env.AFRICASTALKING_API_KEY,
  username: process.env.AFRICASTALKING_USERNAME
});

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// SMS endpoint
app.post('/send-sms', async (req, res) => {
  const { phoneNumber, message = 'Default message from Africastalking' } = req.body;
  
  if (!phoneNumber) {
    return res.status(400).json({ 
      status: 'error',
      message: 'Phone number is required' 
    });
  }

  if (!/^\+?\d{10,15}$/.test(phoneNumber)) {
    return res.status(400).json({ 
      status: 'error',
      message: 'Invalid phone number format. Please use international format (+254...)' 
    });
  }

  try {
    const result = await africastalking.SMS.send({
      to: phoneNumber,
      message: message
    });

    res.status(200).json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('SMS sending error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send SMS',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
});

// USSD endpoint
app.post('/ussd', async (req, res) => {
  const {
    phoneNumber,
    sessionId,
    serviceCode,
    text = ''
  } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ 
      status: 'error',
      message: 'Phone number is required' 
    });
  }

  let response = '';
  const textArray = text.split('*');
  const lastInput = textArray[textArray.length - 1];

  // USSD menu logic
  if (text === '') {
    // First screen
    response = `CON Welcome to our service
    1. Register
    2. Check Balance
    3. Help`;
  } else if (text === '1') {
    // Registration menu
    response = `CON Enter your full name`;
  } else if (text.startsWith('1*')) {
    if (textArray.length === 2) {
      // Got name, ask for email
      response = `CON Enter your email address`;
    } else if (textArray.length === 3) {
      // Complete registration
      const name = textArray[1];
      const email = lastInput;
      
      // Send confirmation SMS
      try {
        await africastalking.SMS.send({
          to: phoneNumber,
          message: `Thank you ${name} for registering! We'll contact you at ${email}`,
          from: "AFTKNG"
        });
        
        response = `END Thank you for registering. You'll receive an SMS confirmation.`;
      } catch (error) {
        console.error('SMS sending error:', error);
        response = `END Registration complete but failed to send SMS.`;
        
      }
    }
  } else if (text === '2') {
    // Check balance
    const balance = "KES 1,500"; // This would come from your database
    
    // Send balance via SMS
    try {
      await africastalking.SMS.send({
        to: phoneNumber,
        message: `Your current balance is ${balance}`
      });
      
      response = `END Your balance details have been sent via SMS.`;
    } catch (error) {
      console.error('SMS sending error:', error);
      response = `END Your balance is ${balance}. Failed to send SMS.`;
    }
  } else if (text === '3') {
    // Help
    response = `END Contact support at help@example.com or call +254700000000`;
  } else {
    response = `END Invalid option selected`;
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Error handling
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});