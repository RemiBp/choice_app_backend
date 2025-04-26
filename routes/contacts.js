const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { choiceAppDb } = require('../index');
const { requireAuth } = require('../middleware/authMiddleware');

// Contact model
const ContactSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String
  },
  phone: {
    type: String
  },
  avatar: {
    type: String
  },
  tags: [{
    type: String
  }],
  notes: {
    type: String
  },
  relatedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const Contact = choiceAppDb.model('Contact', ContactSchema);

// GET user's contacts
router.get('/', requireAuth, async (req, res) => {
  try {
    const contacts = await Contact.find({ userId: req.user.id })
      .sort({ name: 1 });

    // Populate related user information if available
    const populatedContacts = await Promise.all(contacts.map(async (contact) => {
      const contactObj = contact.toObject();
      if (contactObj.relatedUserId) {
        try {
          const User = choiceAppDb.model('User');
          const user = await User.findById(contactObj.relatedUserId, 'name email avatar');
          if (user) {
            contactObj.relatedUser = user;
          }
        } catch (err) {
          console.error(`Error fetching related user ${contactObj.relatedUserId}:`, err);
        }
      }
      return contactObj;
    }));

    res.json(populatedContacts);
  } catch (err) {
    console.error('Error fetching contacts:', err);
    res.status(500).send('Server error');
  }
});

// GET contacts by tag
router.get('/tag/:tag', requireAuth, async (req, res) => {
  try {
    const tag = req.params.tag;
    if (!tag) {
      return res.status(400).json({ message: 'Tag parameter is required' });
    }

    const contacts = await Contact.find({ 
      userId: req.user.id,
      tags: tag
    }).sort({ name: 1 });

    res.json(contacts);
  } catch (err) {
    console.error('Error fetching contacts by tag:', err);
    res.status(500).send('Server error');
  }
});

// GET single contact
router.get('/:contactId', requireAuth, async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.contactId,
      userId: req.user.id
    });

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    const contactObj = contact.toObject();
    if (contactObj.relatedUserId) {
      try {
        const User = choiceAppDb.model('User');
        const user = await User.findById(contactObj.relatedUserId, 'name email avatar');
        if (user) {
          contactObj.relatedUser = user;
        }
      } catch (err) {
        console.error(`Error fetching related user ${contactObj.relatedUserId}:`, err);
      }
    }

    res.json(contactObj);
  } catch (err) {
    console.error('Error fetching contact:', err);
    res.status(500).send('Server error');
  }
});

// POST create contact
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, email, phone, avatar, tags, notes, relatedUserId } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    // Check if contact with this email already exists for this user
    if (email) {
      const existingContact = await Contact.findOne({
        userId: req.user.id,
        email
      });

      if (existingContact) {
        return res.status(400).json({ message: 'Contact with this email already exists' });
      }
    }

    const newContact = new Contact({
      userId: req.user.id,
      name,
      email,
      phone,
      avatar,
      tags: tags || [],
      notes,
      relatedUserId
    });

    const contact = await newContact.save();
    res.json(contact);
  } catch (err) {
    console.error('Error creating contact:', err);
    res.status(500).send('Server error');
  }
});

// PUT update contact
router.put('/:contactId', requireAuth, async (req, res) => {
  try {
    const { name, email, phone, avatar, tags, notes, relatedUserId } = req.body;
    
    // Build contact object
    const contactFields = {};
    if (name) contactFields.name = name;
    if (email) contactFields.email = email;
    if (phone) contactFields.phone = phone;
    if (avatar) contactFields.avatar = avatar;
    if (tags) contactFields.tags = tags;
    if (notes) contactFields.notes = notes;
    if (relatedUserId) contactFields.relatedUserId = relatedUserId;
    contactFields.updatedAt = Date.now();

    let contact = await Contact.findOne({
      _id: req.params.contactId,
      userId: req.user.id
    });

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Update
    contact = await Contact.findByIdAndUpdate(
      req.params.contactId,
      { $set: contactFields },
      { new: true }
    );

    res.json(contact);
  } catch (err) {
    console.error('Error updating contact:', err);
    res.status(500).send('Server error');
  }
});

// DELETE contact
router.delete('/:contactId', requireAuth, async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.contactId,
      userId: req.user.id
    });

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    await Contact.findByIdAndRemove(req.params.contactId);
    res.json({ message: 'Contact removed' });
  } catch (err) {
    console.error('Error deleting contact:', err);
    res.status(500).send('Server error');
  }
});

// POST add tag to contact
router.post('/:contactId/tag', requireAuth, async (req, res) => {
  try {
    const { tag } = req.body;
    
    if (!tag) {
      return res.status(400).json({ message: 'Tag is required' });
    }

    const contact = await Contact.findOne({
      _id: req.params.contactId,
      userId: req.user.id
    });

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    if (!contact.tags.includes(tag)) {
      contact.tags.push(tag);
      contact.updatedAt = Date.now();
      await contact.save();
    }

    res.json(contact);
  } catch (err) {
    console.error('Error adding tag to contact:', err);
    res.status(500).send('Server error');
  }
});

// DELETE remove tag from contact
router.delete('/:contactId/tag/:tag', requireAuth, async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.contactId,
      userId: req.user.id
    });

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    const tagIndex = contact.tags.indexOf(req.params.tag);
    if (tagIndex > -1) {
      contact.tags.splice(tagIndex, 1);
      contact.updatedAt = Date.now();
      await contact.save();
    }

    res.json(contact);
  } catch (err) {
    console.error('Error removing tag from contact:', err);
    res.status(500).send('Server error');
  }
});

// GET all tags for a user
router.get('/tags/all', requireAuth, async (req, res) => {
  try {
    const contacts = await Contact.find({ userId: req.user.id });
    
    // Extract unique tags
    const tags = new Set();
    contacts.forEach(contact => {
      if (contact.tags && contact.tags.length > 0) {
        contact.tags.forEach(tag => tags.add(tag));
      }
    });
    
    res.json(Array.from(tags));
  } catch (err) {
    console.error('Error fetching tags:', err);
    res.status(500).send('Server error');
  }
});

// Search contacts
router.get('/search/:query', requireAuth, async (req, res) => {
  try {
    const searchQuery = req.params.query;
    
    if (!searchQuery) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const regex = new RegExp(searchQuery, 'i');
    
    const contacts = await Contact.find({
      userId: req.user.id,
      $or: [
        { name: regex },
        { email: regex },
        { phone: regex },
        { notes: regex }
      ]
    }).sort({ name: 1 });

    res.json(contacts);
  } catch (err) {
    console.error('Error searching contacts:', err);
    res.status(500).send('Server error');
  }
});

// Import contacts from another source (e.g., phone, Google)
router.post('/import', requireAuth, async (req, res) => {
  try {
    const { contacts } = req.body;
    
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ message: 'Valid contacts array is required' });
    }

    const results = {
      imported: 0,
      duplicates: 0,
      failures: 0
    };

    // Process each contact
    for (const contactData of contacts) {
      if (!contactData.name) {
        results.failures++;
        continue;
      }

      try {
        // Check for duplicate (by email if available)
        let isDuplicate = false;
        if (contactData.email) {
          const existingContact = await Contact.findOne({
            userId: req.user.id,
            email: contactData.email
          });
          
          if (existingContact) {
            results.duplicates++;
            isDuplicate = true;
          }
        }

        if (!isDuplicate) {
          const newContact = new Contact({
            userId: req.user.id,
            name: contactData.name,
            email: contactData.email || '',
            phone: contactData.phone || '',
            avatar: contactData.avatar || '',
            tags: contactData.tags || [],
            notes: contactData.notes || '',
          });
          
          await newContact.save();
          results.imported++;
        }
      } catch (err) {
        console.error('Error importing contact:', err);
        results.failures++;
      }
    }

    res.json({
      message: 'Import completed',
      results
    });
  } catch (err) {
    console.error('Error during import:', err);
    res.status(500).send('Server error');
  }
});

module.exports = router; 