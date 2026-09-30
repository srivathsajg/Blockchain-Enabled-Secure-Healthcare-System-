"""
app/recommendation/meal_suitability.py
======================================
Meal Suitability & Culinary Ontology Layer.

Fixes forensic issues:
1. Noisy dataset meal_type tags (e.g., Biryani tagged as Breakfast/Beverage, Chomchom as Dinner).
2. Food family identity and normalization (prevents same food family appearing twice in one day).
3. Stable display identity construction (adds meaningful culinary metadata).
4. Data quality flagging for developer visibility.
"""
from __future__ import annotations
import re
from typing import Dict, Any, Tuple, Set, List
import pandas as pd

# ── Explicit Culinary Categorization ──────────────────────────────────────────

# Authentic Breakfast Dishes
BREAKFAST_KEYWORDS: Set[str] = {
    "idli", "dosa", "masala dosa", "rava dosa", "poha", "upma", "cheela", "chilla",
    "paratha", "methi paratha", "aloo paratha", "thepla", "oats", "porridge", "sheera",
    "uttapam", "appam", "puttu", "khakhra", "bread", "toast", "pancake", "egg scramble",
    "boiled egg", "omelette", "omlet", "sandwich", "pitha", "bolani", "puri bhaji",
    "chole bhature"
}

# Heavy Main Courses (Lunch & Dinner ONLY - Never breakfast, never snack)
MAIN_COURSE_KEYWORDS: Set[str] = {
    "biryani", "sindhi biryani", "kacchi biryani", "hyderabadi biryani", "pulao", "pulav",
    "palaw", "gosht", "nihari", "haleem", "karahi", "korma", "sajji", "chargha",
    "vindaloo", "rogan josh", "butter chicken", "tandoori chicken", "fish curry",
    "ilish", "rohu", "pomfret", "rezala", "paya", "mantu", "ashak", "dal makhani",
    "palak paneer", "paneer butter masala", "shahi paneer", "rajma", "chole",
    "dal tadka", "kadhi", "curry", "thali", "rice"
}

# Light Nocturnal Meals (Preferred for Dinner)
DINNER_PREFERRED_KEYWORDS: Set[str] = {
    "khichdi", "khichuri", "dal khichdi", "soup", "clear soup", "stew",
    "lauki", "tinda", "torai", "moong dal", "phulka", "roti", "soft roti"
}

# Light Snacks & Nutrient Boosters (Morning Snack & Evening Snack ONLY)
SNACK_KEYWORDS: Set[str] = {
    "makhana", "roasted makhana", "chana", "roasted chana", "chaat", "sprouts",
    "sprouted moong", "bhel", "dhokla", "khandvi", "buttermilk", "chaas", "lassi",
    "nuts", "almonds", "walnuts", "fruit", "fruit bowl", "smoothie", "green tea",
    "samosa", "kachori", "pakora", "pakoda", "dahi bhalla", "pani puri", "gol gappa"
}

# Desserts & Traditional Sweets (Snack treat only, restricted quantity, never main meal)
DESSERT_KEYWORDS: Set[str] = {
    "chomchom", "gulab jamun", "rasgulla", "sandesh", "mishti doi", "kheer", "payasam",
    "halwa", "gajar halwa", "firni", "phirni", "laddu", "jalebi", "barfi", "peda"
}


def get_food_family(recipe_name: str) -> str:
    """
    Extract the core normalized food family from a recipe title.
    Used for strict whole-day variety constraints (Fix 6).
    e.g.:
      'Sindhi Biryani' -> 'biryani'
      'Kacchi Biryani' -> 'biryani'
      'Masala Dosa' -> 'dosa'
      'Moong Dal Cheela' -> 'cheela'
    """
    name = (recipe_name or "").lower().strip()
    
    known_families = [
        "biryani", "pulao", "pulav", "dosa", "idli", "cheela", "chilla", "poha",
        "upma", "khichdi", "khichuri", "paratha", "thepla", "roti", "phulka", "naan",
        "kulcha", "dal", "sambar", "kadhi", "paneer", "tofu", "chicken", "mutton",
        "fish", "prawn", "egg", "chomchom", "gulab jamun", "rasgulla", "halwa",
        "kheer", "firni", "chaat", "pani puri", "gol gappa", "dahi bhalla", "makhana",
        "chana", "samosa", "pakora", "soup", "salad", "noodles", "rice"
    ]
    for fam in known_families:
        if fam in name:
            return fam
            
    # Generic normalization fallback
    cleaned = re.sub(r"[^a-z0-9\s]", "", name)
    words = [
        w for w in cleaned.split()
        if w not in {"special", "style", "traditional", "modern", "fusion", "fresh", "mixed", "hot", "spicy"}
    ]
    return words[0] if words else name


def construct_display_identity(row: Dict[str, Any] | pd.Series) -> str:
    """
    Construct a stable, informative user-facing display name (Fix 5).
    Avoids exposing ugly database IDs while resolving ambiguous generic titles.
    e.g.:
      'Biryani' + 'Indian' + 'Lunch' -> 'Biryani (Indian Culinary Style)'
      'Sindhi Biryani' -> 'Sindhi Biryani'
    """
    name = str(row.get("recipe_name", "Balanced Meal")).strip()
    cuisine = str(row.get("cuisine", "")).strip()
    category = str(row.get("category", "")).strip()
    
    # If the title is too generic (e.g. just "Biryani" or "Dosa" or "Special 123")
    if name.lower() in {"biryani", "dosa", "khichdi", "pulao", "curry"} and cuisine:
        return f"{name} ({cuisine} Style)"
    
    if "special" in name.lower() and category:
        # e.g. "Indian Main Course Special 12" -> "Traditional Indian Main Course"
        cleaned = re.sub(r"\s+special\s+\d+", "", name, flags=re.IGNORECASE)
        return cleaned if len(cleaned) > 4 else f"Nutritious {category}"

    return name


def get_candidate_meal_slots(row: Dict[str, Any] | pd.Series) -> frozenset[str]:
    """
    Determine allowable meal slots based on culinary rules, metadata, and keywords (Fix 7).
    Does NOT blindly trust raw dataset meal_type.
    """
    name = str(row.get("recipe_name", "")).lower()
    cat = str(row.get("category", "")).lower()
    raw_meal_type = str(row.get("meal_type", "")).lower()

    # 1. Desserts and Sweets -> Snacks only
    if any(k in name for k in DESSERT_KEYWORDS) or cat in ["desserts", "sweet", "sweets"]:
        return frozenset(["morning_snack", "evening_snack"])

    # 2. Breakfast Items -> Breakfast only
    if any(k in name for k in BREAKFAST_KEYWORDS):
        return frozenset(["breakfast"])

    # 3. Main Courses (Biryani, curries, rich dals) -> Lunch and Dinner ONLY
    if any(k in name for k in MAIN_COURSE_KEYWORDS):
        return frozenset(["lunch", "dinner"])

    # 4. Light Snacks -> Snacks only
    if any(k in name for k in SNACK_KEYWORDS) or cat in ["snacks", "appetizers", "street food"]:
        return frozenset(["morning_snack", "evening_snack"])

    # 5. Bread category
    if "bread" in cat:
        return frozenset(["breakfast", "lunch", "dinner"])

    # 6. Fallback by dataset category
    if cat in ["main course", "rice dishes", "fish dishes", "meat dishes", "curries"]:
        return frozenset(["lunch", "dinner"])
    if cat in ["beverages"]:
        return frozenset(["morning_snack", "evening_snack"])

    # 7. Safe fallback: if raw_meal_type matches standard slots
    if "breakfast" in raw_meal_type:
        return frozenset(["breakfast"])
    if "snack" in raw_meal_type:
        return frozenset(["morning_snack", "evening_snack"])
        
    return frozenset(["lunch", "dinner"])


def get_data_quality_status(row: Dict[str, Any] | pd.Series) -> str:
    """
    Assign a data quality status flag for developer auditing (Fix 15).
    """
    raw_meal_type = str(row.get("meal_type", "")).lower()
    name = str(row.get("recipe_name", "")).lower()

    # Detect noisy tags in raw dataset
    if any(k in name for k in MAIN_COURSE_KEYWORDS) and raw_meal_type in ["breakfast", "beverage", "snack"]:
        return "QUESTIONABLE_MEAL_TAG"
    if any(k in name for k in DESSERT_KEYWORDS) and raw_meal_type in ["dinner", "lunch"]:
        return "QUESTIONABLE_MEAL_TAG"

    cals = float(row.get("calories", 0))
    if cals <= 0:
        return "MISSING_NUTRIENT_DATA"

    return "VERIFIED_SOURCE"
