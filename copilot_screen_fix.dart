// COPIER CETTE LIGNE AU DÉBUT DU FICHIER copilot_screen.dart, APRÈS LES IMPORTS STANDARD
import 'package:flutter_animate/flutter_animate.dart';

// VÉRIFIER QUE LES MÉTHODES DE ANIMATE SONT UTILISÉES COMME SUIT:
// widget.animate() au lieu de widget.animate
// EXEMPLE:

// AVANT (ne fonctionne pas):
/*
Container(...)
  .animate(delay: 300.ms)
  .fadeIn(duration: 400.ms)
  .slideY(begin: 0.2, end: 0);
*/

// APRÈS (fonctionne):
/*
Animate(
  child: Container(...),
  effects: [
    FadeEffect(duration: Duration(milliseconds: 400)),
    SlideEffect(begin: Offset(0, 0.2), end: Offset(0, 0), duration: Duration(milliseconds: 400))
  ],
  delay: Duration(milliseconds: 300),
)
*/

// OU UTILISEZ LA SYNTAXE CORRECTE POUR LES EXTENSIONS ANIMATE:
/*
Container(...)
  .animate() // Pas de paramètres ici
  .fadeIn(duration: 300.ms)
  .slideY(begin: 0.2, end: 0, duration: 400.ms);
*/

// CORRECTION POUR LES LIGNES SPÉCIFIQUES SIGNALÉES DANS L'ERREUR:

// Pour la ligne 455 (ProfileCard):
/*
REMPLACER:
.animate(delay: (80 * index).ms)
.fadeIn(duration: 300.ms)
.slideX(begin: 0.2, end: 0, duration: 400.ms, curve: Curves.easeOutCubic);

PAR:
.animate(
  onPlay: (controller) => controller.forward(from: 0.0),
)
.effect(
  delay: Duration(milliseconds: 80 * index),
  effects: [
    FadeEffect(duration: Duration(milliseconds: 300)),
    SlideEffect(
      begin: Offset(0.2, 0),
      end: Offset(0, 0),
      duration: Duration(milliseconds: 400),
      curve: Curves.easeOutCubic
    )
  ]
);
*/

// Pour les lignes 910, 912, 914 (Suggestions):
/*
REMPLACER:
.animate(delay: 100.ms).fadeIn(duration: 400.ms).slideY(begin: 0.2, end: 0),

PAR:
// Utiliser Animate comme widget wrapper au lieu d'extension
Animate(
  effects: [
    FadeEffect(duration: Duration(milliseconds: 400)),
    SlideEffect(
      begin: Offset(0, 0.2),
      end: Offset(0, 0),
      duration: Duration(milliseconds: 400)
    )
  ],
  delay: Duration(milliseconds: 100),
  child: // widget original ici
),
*/

// Pour la ligne 917 (Container):
/*
REMPLACER:
).animate().fadeIn(duration: 600.ms).scale(
  begin: 0.95,
  end: 1.0,
  duration: 600.ms,
  curve: Curves.easeOut,
),

PAR:
// Utiliser Animate comme widget wrapper au lieu d'extension
Animate(
  effects: [
    FadeEffect(duration: Duration(milliseconds: 600)),
    ScaleEffect(
      begin: 0.95,
      end: 1.0,
      duration: Duration(milliseconds: 600),
      curve: Curves.easeOut
    )
  ],
  child: // widget original ici
),
*/

// Pour la ligne 1091 (Flexible):
/*
REMPLACER:
).animate(delay: (50 * index).ms)
.fadeIn(duration: 300.ms)
.move(
  // Décaler légèrement chaque carte
  begin: Offset(0, 5),
  end: Offset.zero,
  duration: 400.ms,
  curve: Curves.easeOutCubic,
);

PAR:
// Utiliser Animate comme widget wrapper au lieu d'extension
Animate(
  effects: [
    FadeEffect(duration: Duration(milliseconds: 300)),
    MoveEffect(
      begin: Offset(0, 5),
      end: Offset.zero,
      duration: Duration(milliseconds: 400),
      curve: Curves.easeOutCubic
    )
  ],
  delay: Duration(milliseconds: 50 * index),
  child: // widget original ici
),
*/