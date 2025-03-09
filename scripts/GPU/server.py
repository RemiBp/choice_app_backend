"""
Server.py - API FastAPI pour servir le modèle Mistral-7B-Instruct
"""
import os
import torch

# Toggle pour activer/désactiver la fonctionnalité IA
AI_ENABLED = False  # Mettre à True pour réactiver l'IA
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from transformers import AutoModelForCausalLM, AutoTokenizer

# Configuration
MODEL_PATH = "/model"  # Chemin défini dans le Dockerfile
MAX_NEW_TOKENS = 1024
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DEFAULT_TEMPERATURE = 0.7
DEFAULT_TOP_P = 0.95

# Initialisation de l'application FastAPI
app = FastAPI(title="Mistral-7B API Service")

# Modèles Pydantic pour les requêtes/réponses
class InferenceRequest(BaseModel):
    inputs: str
    parameters: Optional[Dict[str, Any]] = None

class InferenceResponse(BaseModel):
    generated_text: str

# Variables globales pour le modèle et le tokenizer
model = None
tokenizer = None

# Chargement paresseux du modèle - uniquement au premier appel
def load_model():
    global model, tokenizer
    
    if model is None or tokenizer is None:
        print("Chargement du modèle Mistral-7B...")
        
        # Chargement du tokenizer
        tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
        
        # Chargement du modèle avec optimisations
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_PATH,
            torch_dtype=torch.float16,  # Utilisation de la précision réduite pour économiser la mémoire
            device_map="auto",         # Allocation automatique sur les GPUs disponibles
            low_cpu_mem_usage=True      # Optimisation pour la mémoire CPU
        )
        
        print(f"Modèle chargé sur {DEVICE}")

@app.on_event("startup")
async def startup_event():
    # Ne pas charger le modèle au démarrage pour économiser la mémoire
    # Il sera chargé lors du premier appel
    pass

@app.post("/models/{model_name}")
async def generate(model_name: str, request: InferenceRequest, background_tasks: BackgroundTasks):
    """
    Point d'API principal - compatible avec l'API Hugging Face Inference
    """
    # Vérifier si la fonctionnalité IA est activée
    if not AI_ENABLED:
        return {"generated_text": "La fonctionnalité IA est actuellement désactivée. Changez AI_ENABLED à True pour la réactiver."}
    
    # Charger le modèle si ce n'est pas déjà fait
    if model is None:
        load_model()
    
    # Extraire le prompt et les paramètres
    prompt = request.inputs
    params = request.parameters or {}
    
    # Paramètres de génération
    max_new_tokens = params.get("max_new_tokens", MAX_NEW_TOKENS)
    temperature = params.get("temperature", DEFAULT_TEMPERATURE)
    top_p = params.get("top_p", DEFAULT_TOP_P)
    do_sample = params.get("do_sample", True)
    
    try:
        # Tokenization
        inputs = tokenizer(prompt, return_tensors="pt").to(DEVICE)
        
        # Génération de texte
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                top_p=top_p,
                do_sample=do_sample
            )
        
        # Décodage du résultat
        generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
        
        # Supprimer le prompt original du texte généré
        response_text = generated_text
        if prompt in generated_text:
            response_text = generated_text[len(prompt):]
        
        return {"generated_text": response_text}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de génération: {str(e)}")

@app.get("/health")
async def health_check():
    """Vérification de l'état de santé de l'API"""
    return {"status": "ok", "device": DEVICE, "ai_enabled": AI_ENABLED}

if __name__ == "__main__":
    import uvicorn
    
    # Récupérer le port depuis une variable d'environnement ou utiliser 8000 par défaut
    port = int(os.environ.get("PORT", 8000))
    
    # Démarrer le serveur
    uvicorn.run(app, host="0.0.0.0", port=port)