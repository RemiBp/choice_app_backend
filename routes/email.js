const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const crypto = require('crypto');
const EmailLog = require('../models/EmailLog');

// Load environment variables
dotenv.config();

// MongoDB connection
const choiceAppDb = mongoose.connection.useDb('choice_app');

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
    
    // Log the email using our EmailLog model
    await EmailLog.create({
      userId,
      type,
      email: userEmail,
      subject,
      content,
      status: 'sent',
      messageId: info.messageId,
      sendingMethod: 'nodemailer'
    });
    
    res.status(200).json({ 
      message: 'Test notification email sent successfully',
      emailId: info.messageId
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    
    // Log the error
    try {
      await EmailLog.create({
        userId,
        type,
        email: req.body.email || 'unknown',
        subject: 'Test Notification',
        content: 'Failed to send',
        status: 'error',
        error: error.message,
        sendingMethod: 'nodemailer'
      });
    } catch (logError) {
      console.error('Error logging email failure:', logError);
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
    
    // Log the email using our EmailLog model
    await EmailLog.create({
      userId: user._id,
      type: 'verification',
      email,
      subject: 'Verify Your Email - Choice App',
      content: `Verification link sent: ${verificationLink}`,
      status: 'sent',
      messageId: info.messageId,
      sendingMethod: 'nodemailer',
      metadata: {
        verificationToken
      }
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
 * @route POST /api/email/send-password-reset
 * @desc Send password reset email to user
 */
router.post('/send-password-reset', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  
  try {
    // Get user from database
    const User = choiceAppDb.model('User');
    const user = await User.findOne({ email });
    
    // For security reasons, don't reveal if user exists or not
    if (!user) {
      return res.status(200).json({ 
        message: 'If this email exists in our database, a password reset link has been sent.' 
      });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Update user with token
    user.reset_password_token = resetToken;
    user.reset_password_expires = Date.now() + 3600000; // 1 hour
    await user.save();
    
    // Build reset link
    const resetLink = `${process.env.FRONTEND_URL || 'https://app.choiceapp.com'}/reset-password?token=${resetToken}`;
    
    // Send email
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@choiceapp.com',
      to: email,
      subject: 'Reset Your Password - Choice App',
      html: `
        <h1>Reset Your Password</h1>
        <p>Hello ${user.name || 'there'},</p>
        <p>You've requested to reset your password for your Choice App account.</p>
        <p>Please click the link below to set a new password:</p>
        <a href="${resetLink}" style="display: inline-block; background-color: #4285F4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 20px 0;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
        <p>Best regards,<br>The Choice App Team</p>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    // Log the email using our EmailLog model
    await EmailLog.create({
      userId: user._id,
      type: 'password_reset',
      email,
      subject: 'Reset Your Password - Choice App',
      content: `Password reset link sent: ${resetLink}`,
      status: 'sent',
      messageId: info.messageId,
      sendingMethod: 'nodemailer',
      metadata: {
        resetToken
      }
    });
    
    res.status(200).json({ 
      message: 'If this email exists in our database, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('Error sending password reset email:', error);
    
    res.status(500).json({ message: 'Error sending password reset email', error: error.message });
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

/**
 * @route GET /api/email/stats
 * @desc Get email statistics
 */
router.get('/stats', async (req, res) => {
  const { period = 30 } = req.query;
  
  try {
    const stats = await EmailLog.getStats({}, parseInt(period));
    const statsByType = await EmailLog.getStatsByType(parseInt(period));
    
    res.status(200).json({
      overall: stats,
      byType: statsByType
    });
  } catch (error) {
    console.error('Error retrieving email statistics:', error);
    res.status(500).json({ message: 'Error retrieving email statistics', error: error.message });
  }
});

/**
 * @route GET /api/email/tracking/:messageId/open
 * @desc Track email opening (used in HTML emails with a tracking pixel)
 */
router.get('/tracking/:messageId/open', async (req, res) => {
  const { messageId } = req.params;
  
  try {
    const email = await EmailLog.findOne({ messageId });
    
    if (email) {
      await email.markAsOpened();
    }
    
    // Return a transparent 1x1 pixel for tracking
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length
    });
    res.end(pixel);
  } catch (error) {
    console.error('Error tracking email open:', error);
    
    // Still return the tracking pixel to not break email clients
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length
    });
    res.end(pixel);
  }
});

/**
 * @route GET /api/email/tracking/:messageId/click
 * @desc Track email link clicking (using URL rewriting)
 */
router.get('/tracking/:messageId/click', async (req, res) => {
  const { messageId } = req.params;
  const { redirect } = req.query;
  
  try {
    const email = await EmailLog.findOne({ messageId });
    
    if (email) {
      await email.markAsClicked();
    }
    
    // Redirect to the target URL
    if (redirect) {
      return res.redirect(redirect);
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error tracking email click:', error);
    
    // Still redirect if possible
    if (req.query.redirect) {
      return res.redirect(req.query.redirect);
    }
    
    res.status(500).json({ message: 'Error tracking email click', error: error.message });
  }
});

module.exports = router; 