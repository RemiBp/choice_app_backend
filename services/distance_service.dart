import 'dart:convert';
import 'package:http/http.dart' as http;

class DistanceService {
  final String _baseUrl = 'http://localhost:5000'; // Assure-toi que ton backend tourne en local

  /// Calcule la distance entre deux points (origine et destination) en appelant l'API backend
  Future<Map<String, dynamic>?> calculateDistance({
    required double originLat,
    required double originLng,
    required double destinationLat,
    required double destinationLng,
    String mode = 'walking', // "driving", "bicycling", etc.
  }) async {
    final url = Uri.parse('$_baseUrl/api/distance');
    final body = {
      'origin': {'lat': originLat, 'lng': originLng},
      'destination': {'lat': destinationLat, 'lng': destinationLng},
      'mode': mode,
    };

    try {
      final response = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: json.encode(body),
      );

      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        print('Erreur API : ${response.body}');
        return null;
      }
    } catch (error) {
      print('Erreur lors de l’appel HTTP : $error');
      return null;
    }
  }
}
