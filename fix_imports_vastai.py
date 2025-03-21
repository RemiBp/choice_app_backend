#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Script de correction des chemins d'importation pour les scripts Mistral sur VastAI
Ce script modifie les fichiers Python pour qu'ils puissent trouver les modules dans scripts/Restauration/
"""

import os
import sys
import re

def add_import_path_to_file(file_path):
    """Ajoute le chemin d'importation pour scripts/Restauration/ au début du fichier"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Vérifier si le fichier contient déjà l'ajout de chemin
        if "sys.path.append" in content and "scripts/Restauration" in content:
            print(f"✓ Le fichier {file_path} est déjà corrigé")
            return True
            
        # Définir le code à ajouter au début du fichier après les imports
        import_path_code = """
# Ajouter le chemin scripts/Restauration/ au PYTHONPATH
import sys
import os
restauration_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'Restauration')
if restauration_path not in sys.path:
    sys.path.append(restauration_path)
"""
        
        # Trouver l'emplacement pour insérer le code (après les imports)
        pattern = r'^(import .*?\n|from .*? import .*?\n)+'
        match = re.search(pattern, content, re.MULTILINE)
        
        if match:
            # Insérer après le dernier import
            insert_pos = match.end()
            new_content = content[:insert_pos] + import_path_code + content[insert_pos:]
        else:
            # Insérer au début du fichier
            new_content = import_path_code + content
            
        # Écrire le contenu modifié
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
            
        print(f"✓ Correction appliquée à {file_path}")
        return True
    except Exception as e:
        print(f"❌ Erreur lors de la modification de {file_path}: {e}")
        return False

def process_directory(directory, file_pattern=None):
    """Traite tous les fichiers Python dans un répertoire"""
    count = 0
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.py'):
                if file_pattern and file_pattern not in file:
                    continue
                    
                file_path = os.path.join(root, file)
                if add_import_path_to_file(file_path):
                    count += 1
    return count

def create_symlinks_if_missing():
    """Crée des liens symboliques pour les modules dans scripts/vast_ai_scripts/ si nécessaire"""
    workspace_dir = os.getcwd()
    restauration_dir = os.path.join(workspace_dir, "scripts", "Restauration")
    vast_ai_dir = os.path.join(workspace_dir, "scripts", "vast_ai_scripts")
    
    for module in ["scraping_pages_menus.py", "menu_sur_mongo.py", "ajuster_carbone_cal_nutri_mongo.py", "ajuster_notes_items.py"]:
        source = os.path.join(restauration_dir, module)
        target = os.path.join(vast_ai_dir, module)
        
        if os.path.exists(source) and not os.path.exists(target):
            try:
                # Option 1: Créer un lien symbolique
                try:
                    os.symlink(source, target)
                    print(f"✓ Lien symbolique créé: {target} -> {source}")
                except:
                    # Option 2: Copier le fichier si les liens symboliques ne sont pas supportés
                    import shutil
                    shutil.copy2(source, target)
                    print(f"✓ Fichier copié: {source} -> {target}")
            except Exception as e:
                print(f"❌ Erreur lors de la création du lien pour {module}: {e}")

def main():
    if len(sys.argv) < 2:
        workspace_dir = os.getcwd()
        vast_ai_dir = os.path.join(workspace_dir, "scripts", "vast_ai_scripts")
        
        print(f"Répertoire par défaut: {vast_ai_dir}")
        
        if not os.path.isdir(vast_ai_dir):
            print(f"❌ Le répertoire {vast_ai_dir} n'existe pas")
            sys.exit(1)
            
        # Créer des liens symboliques si nécessaire
        print("\n=== Création de liens symboliques pour les modules ===")
        create_symlinks_if_missing()
            
        # Traiter les fichiers Python dans le répertoire vast_ai_scripts
        print("\n=== Correction des fichiers dans scripts/vast_ai_scripts/ ===")
        count_vast = process_directory(vast_ai_dir, "_mistral")
        print(f"✓ {count_vast} fichiers corrigés dans scripts/vast_ai_scripts/")
    else:
        directory = sys.argv[1]
        
        if not os.path.isdir(directory):
            print(f"❌ Le répertoire {directory} n'existe pas")
            sys.exit(1)
            
        count = process_directory(directory)
        print(f"✓ {count} fichiers corrigés dans {directory}")

if __name__ == "__main__":
    main()
    print("\nLes corrections ont été appliquées.")
    print("N'oubliez pas de configurer le PYTHONPATH correctement:")
    print("export PYTHONPATH=$PYTHONPATH:/workspace")