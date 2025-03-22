import 'dart:async';
import 'dart:math';
import 'package:choice_app/models/models.dart';
import 'package:choice_app/services/ai_service.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

// Ce fichier est un remplacement complet pour copilot_screen.dart
// avec des animations standard Flutter au lieu de flutter_animate

class CopilotScreen extends StatefulWidget {
  @override
  _CopilotScreenState createState() => _CopilotScreenState();
}

class _CopilotScreenState extends State<CopilotScreen> with SingleTickerProviderStateMixin {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final AIService _aiService = AIService();
  
  bool _isLoading = false;
  String _currentQuery = '';
  List<Map<String, dynamic>> _messages = [];
  List<String> _suggestions = [
    "Restaurants romantiques à Paris",
    "Concerts ce weekend",
    "Bars à vin près de moi"
  ];
  
  // Animation controllers
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;
  
  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: 600),
    );
    
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeIn)
    );
    
    _slideAnimation = Tween<Offset>(begin: Offset(0, 0.2), end: Offset.zero).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOutCubic)
    );
    
    _animationController.forward();
    
    // Ajouter le message de bienvenue
    _messages.add({
      'type': 'assistant',
      'content': 'Bonjour ! Comment puis-je vous aider aujourd\'hui ?',
      'timestamp': DateTime.now(),
      'profiles': [],
    });
  }
  
  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    _animationController.dispose();
    super.dispose();
  }
  
  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }
  
  Future<void> _sendMessage(String message) async {
    if (message.trim().isEmpty) return;
    
    setState(() {
      _isLoading = true;
      _currentQuery = message;
      _messages.add({
        'type': 'user',
        'content': message,
        'timestamp': DateTime.now(),
        'profiles': [],
      });
      _textController.clear();
    });
    
    // Scroll to bottom after the message is added
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollToBottom();
    });
    
    try {
      final response = await _aiService.sendQuery(message);
      
      setState(() {
        _isLoading = false;
        _messages.add({
          'type': 'assistant',
          'content': response.response,
          'timestamp': DateTime.now(),
          'profiles': response.profiles ?? [],
        });
      });
      
      // Scroll to bottom after the response is added
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollToBottom();
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _messages.add({
          'type': 'assistant',
          'content': 'Désolé, une erreur est survenue. Veuillez réessayer.',
          'timestamp': DateTime.now(),
          'profiles': [],
        });
      });
      
      // Scroll to bottom after the error message is added
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollToBottom();
      });
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Copilot IA'),
        elevation: 0,
        actions: [
          IconButton(
            icon: Icon(Icons.refresh),
            onPressed: () {
              setState(() {
                _messages = [
                  {
                    'type': 'assistant',
                    'content': 'Bonjour ! Comment puis-je vous aider aujourd\'hui ?',
                    'timestamp': DateTime.now(),
                    'profiles': [],
                  }
                ];
              });
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final message = _messages[index];
                
                if (message['type'] == 'user') {
                  return _buildUserMessage(message, index);
                } else {
                  return _buildAssistantMessage(message, index);
                }
              },
            ),
          ),
          if (_isLoading) _buildTypingIndicator(),
          if (_messages.length == 1) _buildWelcomeCard(),
          _buildInputArea(),
        ],
      ),
    );
  }
  
  Widget _buildTypingIndicator() {
    return Container(
      padding: EdgeInsets.symmetric(vertical: 16, horizontal: 24),
      alignment: Alignment.centerLeft,
      child: Row(
        children: [
          Text('Copilot réfléchit', style: TextStyle(fontStyle: FontStyle.italic, color: Colors.grey[700])),
          SizedBox(width: 8),
          _buildDot(0),
          _buildDot(1),
          _buildDot(2),
        ],
      ),
    );
  }
  
  Widget _buildDot(int index) {
    return AnimatedBuilder(
      animation: _animationController,
      builder: (context, child) {
        return Container(
          margin: EdgeInsets.symmetric(horizontal: 2),
          height: 8,
          width: 8,
          decoration: BoxDecoration(
            color: Colors.grey[700],
            borderRadius: BorderRadius.circular(4),
          ),
          child: Opacity(
            opacity: (index == 0 && _animationController.value < 0.3) ||
                     (index == 1 && _animationController.value >= 0.3 && _animationController.value < 0.6) ||
                     (index == 2 && _animationController.value >= 0.6) ? 1.0 : 0.4,
            child: Container(),
          ),
        );
      },
    );
  }
  
  Widget _buildUserMessage(Map<String, dynamic> message, int index) {
    return Align(
      alignment: Alignment.centerRight,
      child: FadeTransition(
        opacity: _fadeAnimation,
        child: SlideTransition(
          position: _slideAnimation,
          child: Container(
            margin: EdgeInsets.only(bottom: 16),
            padding: EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).primaryColor,
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.1),
                  blurRadius: 5,
                  offset: Offset(0, 2),
                ),
              ],
            ),
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
            child: Text(
              message['content'],
              style: TextStyle(color: Colors.white),
            ),
          ),
        ),
      ),
    );
  }
  
  Widget _buildAssistantMessage(Map<String, dynamic> message, int index) {
    // Animation avec délai basé sur l'index
    final animationDelay = Duration(milliseconds: 100);
    
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: EdgeInsets.only(bottom: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Avatar et bulles
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  backgroundColor: Colors.blue[100],
                  child: Icon(Icons.assistant, color: Colors.blue[900]),
                ),
                SizedBox(width: 8),
                Flexible(
                  child: FadeTransition(
                    opacity: _fadeAnimation,
                    child: SlideTransition(
                      position: _slideAnimation,
                      child: Container(
                        padding: EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.grey[200],
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.05),
                              blurRadius: 5,
                              offset: Offset(0, 2),
                            ),
                          ],
                        ),
                        child: Text(message['content']),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            
            // Profils associés à la réponse
            if (message['profiles'] != null && message['profiles'].isNotEmpty)
              Padding(
                padding: EdgeInsets.only(left: 48, top: 8),
                child: _buildProfilesGrid(message['profiles']),
              ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildProfilesGrid(List profiles) {
    return Container(
      margin: EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Voici ce que j\'ai trouvé :',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 8),
          GridView.builder(
            physics: NeverScrollableScrollPhysics(),
            shrinkWrap: true,
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 0.8,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
            ),
            itemCount: profiles.length,
            itemBuilder: (context, index) {
              final profile = profiles[index];
              
              return FadeTransition(
                opacity: _fadeAnimation,
                child: SlideTransition(
                  position: _slideAnimation,
                  child: _buildProfileCard(profile, index),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
  
  Widget _buildProfileCard(dynamic profile, int index) {
    final gradient = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Colors.transparent, Colors.black54],
    );
    
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          // Navigation vers le profil
        },
        child: Stack(
          children: [
            // Image de fond
            Container(
              height: double.infinity,
              width: double.infinity,
              child: profile['image'] != null
                  ? Image.network(
                      profile['image'],
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) => 
                          Container(color: Colors.grey[300], child: Icon(Icons.image, size: 50)),
                    )
                  : Container(
                      color: Colors.grey[300],
                      child: Icon(Icons.image, size: 50),
                    ),
            ),
            
            // Gradient overlay
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(gradient: gradient),
              ),
            ),
            
            // Informations du profil
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Padding(
                padding: EdgeInsets.all(8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      profile['name'] ?? 'Sans nom',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (profile['address'] != null)
                      Text(
                        profile['address'],
                        style: TextStyle(color: Colors.white, fontSize: 12),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    SizedBox(height: 4),
                    if (profile['type'] != null)
                      Container(
                        padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          profile['type'],
                          style: TextStyle(color: Colors.white, fontSize: 10),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildWelcomeCard() {
    return FadeTransition(
      opacity: _fadeAnimation,
      child: SlideTransition(
        position: _slideAnimation,
        child: Card(
          margin: EdgeInsets.all(16),
          elevation: 4,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Bienvenue sur Copilot IA!',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'Je peux vous aider à trouver des restaurants, événements et activités. Que souhaitez-vous découvrir?',
                ),
                SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _suggestions.map((suggestion) {
                    return _buildSuggestionChip(suggestion);
                  }).toList(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
  
  Widget _buildSuggestionChip(String suggestion) {
    return FadeTransition(
      opacity: _fadeAnimation,
      child: ActionChip(
        label: Text(suggestion),
        onPressed: () => _sendMessage(suggestion),
        backgroundColor: Colors.blue[50],
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: Colors.blue[100]!),
        ),
      ),
    );
  }
  
  Widget _buildInputArea() {
    return Container(
      padding: EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            offset: Offset(0, -2),
            blurRadius: 5,
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _textController,
              decoration: InputDecoration(
                hintText: 'Posez votre question...',
                filled: true,
                fillColor: Colors.grey[100],
                contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(30),
                  borderSide: BorderSide.none,
                ),
                suffixIcon: _textController.text.isNotEmpty
                    ? IconButton(
                        icon: Icon(Icons.close),
                        onPressed: () {
                          _textController.clear();
                          setState(() {});
                        },
                      )
                    : null,
              ),
              onChanged: (value) {
                // Force refresh pour montrer/cacher le bouton clear
                setState(() {});
              },
              onSubmitted: (message) => _sendMessage(message),
            ),
          ),
          SizedBox(width: 8),
          AnimatedBuilder(
            animation: _animationController,
            builder: (context, child) {
              return Transform.scale(
                scale: 1.0 + (_animationController.value * 0.1),
                child: child,
              );
            },
            child: FloatingActionButton(
              onPressed: () => _sendMessage(_textController.text),
              child: Icon(Icons.send),
              mini: true,
            ),
          ),
        ],
      ),
    );
  }
}