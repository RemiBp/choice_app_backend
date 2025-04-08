const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// MongoDB connection
const choiceAppDb = mongoose.connection.useDb('choice_app');

// Create email logs schema and model
const emailLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  type: { type: String, required: true },
  email: { type: String, required: true },
  subject: { type: String, required: true },
  content: { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
  status: { type: String, default: 'sent' },
  error: { type: String },
});

const EmailLog = choiceAppDb.model('EmailLog', emailLogSchema);

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

/**
 * @route POST /api/email/test-notification
 * @desc Send a test notification email
 */
router.post('/test-notification', async (req, res) => {
  const { type, userId } = req.body;
  
  if (!type || !userId) {
    return res.status(400).json({ message: 'Type and userId are required' });
  }
  
  try {
    // Get user from database to get their email
    const User = choiceAppDb.model('User');
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const userEmail = user.email;
    
    // Different email templates based on type
    let subject = 'Test Notification from Choice App';
    let content = '<p>This is a test notification from Choice App.</p>';
    
    switch (type) {
      case 'friend_requests':
        subject = 'New Friend Request - Test';
        content = '<p>This is a test of a friend request notification.</p>';
        break;
      case 'recommendations':
        subject = 'Recommended Places Near You - Test';
        content = '<p>This is a test of recommendations notifications.</p>';
        break;
      case 'inactivity':
        subject = 'We Miss You! - Test';
        content = '<p>This is a test of the inactivity reminder.</p>';
        break;
      case 'wellness_digest':
        subject = 'Your Wellness Digest - Test';
        content = '<p>This is a test of the wellness digest email.</p>';
        break;
      case 'marketing':
        subject = 'Special Offer from Choice App - Test';
        content = '<p>This is a test of marketing emails.</p>';
        break;
      default:
        subject = 'Test Notification from Choice App';
        content = '<p>This is a general test notification from Choice App.</p>';
    }
    
    // Send email
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@choiceapp.com',
      to: userEmail,
      subject,
      html: content
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    // Log the email
    await EmailLog.create({
      userId,
      type,
      email: userEmail,
      subject,
      content,
      status: 'sent'
    });
    
    res.status(200).json({ 
      message: 'Test notification email sent successfully',
      emailId: info.messageId
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    
    // Log the error
    if (req.body.email) {
      await EmailLog.create({
        userId,
        type,
        email: req.body.email,
        subject: 'Test Notification',
        content: 'Failed to send',
        status: 'error',
        error: error.message
      });
    }
    
    res.status(500).json({ message: 'Error sending test notification', error: error.message });
  }
});

/**
 * @route POST /api/email/resend-verification
 * @desc Resend email verification link
 */
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  
  try {
    // Get user from database
    const User = choiceAppDb.model('User');
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }
    
    // Generate verification token if not exists
    const verificationToken = user.verificationToken || crypto.randomBytes(32).toString('hex');
    
    // Update user with token if not already set
    if (!user.verificationToken) {
      user.verificationToken = verificationToken;
      await user.save();
    }
    
    // Build verification link
    const verificationLink = `${process.env.FRONTEND_URL || 'https://app.choiceapp.com'}/verify-email?token=${verificationToken}`;
    
    // Send email
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@choiceapp.com',
      to: email,
      subject: 'Verify Your Email - Choice App',
      html: `
        <h1>Verify Your Email</h1>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationLink}">Verify Email</a>
        <p>If you did not create an account, you can safely ignore this email.</p>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    // Log the email
    await EmailLog.create({
      userId: user._id,
      type: 'verification',
      email,
      subject: 'Verify Your Email - Choice App',
      content: `Verification link sent: ${verificationLink}`,
      status: 'sent'
    });
    
    res.status(200).json({ 
      message: 'Verification email sent successfully'
    });
  } catch (error) {
    console.error('Error sending verification email:', error);
    
    res.status(500).json({ message: 'Error sending verification email', error: error.message });
  }
});

/**
 * @route GET /api/email/logs
 * @desc Get email logs for a user
 */
router.get('/logs', async (req, res) => {
  const { userId, limit = 50 } = req.query;
  
  if (!userId) {
    return res.status(400).json({ message: 'userId parameter is required' });
  }
  
  try {
    const logs = await EmailLog.find({ userId })
      .sort({ sentAt: -1 })
      .limit(parseInt(limit))
      .select('-content'); // Exclude the full content for performance
    
    res.status(200).json(logs);
  } catch (error) {
    console.error('Error retrieving email logs:', error);
    res.status(500).json({ message: 'Error retrieving email logs', error: error.message });
  }
});

module.exports = router; 