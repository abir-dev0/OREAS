import re
from typing import Dict, List, Tuple
from instagram.models import InstagramComment

# Keyword patterns for rule-based analysis (French, Darija, Arabic, English)
INTENT_KEYWORDS = {
    "asks_price": [
        "price", "cost", "how much", "$", "£", "€", "dh", "dhs", "mad", "taman", "bch7al", "bchhal", 
        "chhal", "bshal", "prix", "combien", "tarif", "valeur", "cout", "coûte", "coute", "prx",
        "ثمن", "بكم", "السعر", "شحال", "بشحال"
    ],
    "asks_availability": [
        "available", "in stock", "out of stock", "restock", "when will", "buy", "order", "dispo", 
        "disponible", "stock", "rupture", "acheter", "commander", "en stock", "kayn", "kayna", 
        "ba9i", "baqi", "baqa", "moujoud", "dispo dial", "baghi", "bghit", "ndoz", "موجود", "متوفر", 
        "باقي", "ديسبو", "بغيت", "باغي", "للطلب"
    ],
    "asks_color": [
        "color", "colour", "couleur", "noir", "blanc", "rouge", "bleu", "vert", "jaune", "rose", 
        "gris", "marron", "beige", "violet", "lilas", "lon", "laoun", "k7al", "khal", "biyad", 
        "byad", "7mar", "hmar", "zra9", "zraq", "khdar", "sfar", "werdi", "khzi", "لون", "ألوان", 
        "الوان", "أسود", "ابيض", "أحمر", "أزرق", "أخضر"
    ],
    "asks_size": [
        "size", "fit", "small", "medium", "large", "xl", "xxl", "xs", "taille", "mesure", 
        "longueur", "largeur", "taye", "tay", "tayss", "la9yas", "laqyas", "qyas", "قياس", 
        "مقاس", "طاي", "طايي", "عبار"
    ],
    "asks_delivery": [
        "shipping", "delivery", "ship", "deliver", "arrive", "location", "shop", "store", 
        "livraison", "livrer", "envoi", "expedition", "expédition", "délai", "frais de port", 
        "adresse", "boutique", "magasin", "toussel", "towsil", "ghatwsel", "fin katsifto", 
        "blassa", "mahal", "fin jito", "توصيل", "شحن", "توصل", "أمانة", "امانة", "عنوان", "محل"
    ],
    "has_complaint": [
        "bad quality", "poor fabric", "thin", "cheap", "wrong size", "disappointed", "fake", 
        "qualité", "matiere", "matière", "tissu", "coton", "mauvaise", "remboursement", 
        "transparent", "fragile", "arnaque", "déçu", "tob", "tobe", "calite", "qualite", 
        "khra", "na9ess", "toup", "kdoub", "sbegh", "ghali bezaf", "ثوب", "جودة", "خام", 
        "قماش", "رداءة", "غالي", "كذوب", "نصب"
    ]
}

COLOR_MAP = {
    "noir": ["black", "noir", "k7al", "khal", "أسود"],
    "blanc": ["white", "blanc", "biyad", "byad", "ابيض"],
    "rouge": ["red", "rouge", "7mar", "hmar", "أحمر"],
    "bleu": ["blue", "bleu", "zra9", "zraq", "أزرق"],
    "vert": ["green", "vert", "khdar", "أخضر"],
    "rose": ["pink", "rose", "werdi", "وردي"],
    "beige": ["beige", "بيج"],
    "gris": ["grey", "gray", "gris", "رمادي"],
    "jaune": ["yellow", "jaune", "sfar", "أصفر"],
    "violet": ["purple", "violet", "lilas", "بنفسجي"]
}

SIZE_MAP = {
    "xs": ["xs", "extra small"],
    "s": ["s", "small", "petit"],
    "m": ["m", "medium", "moyen"],
    "l": ["l", "large", "grand"],
    "xl": ["xl", "extra large"],
    "xxl": ["xxl", "double xl"],
    "xxxl": ["xxxl", "3xl"]
}

def analyze_text(text: str) -> dict:
    if not text:
        return {
            "asks_price": False,
            "asks_availability": False,
            "asks_color": False,
            "asks_size": False,
            "asks_delivery": False,
            "has_complaint": False,
            "detected_colors": [],
            "detected_sizes": []
        }
    
    lowered = text.lower()
    
    # 1. Detect intents based on keyword inclusion
    analysis = {
        "asks_price": any(k in lowered for k in INTENT_KEYWORDS["asks_price"]),
        "asks_availability": any(k in lowered for k in INTENT_KEYWORDS["asks_availability"]),
        "asks_color": any(k in lowered for k in INTENT_KEYWORDS["asks_color"]),
        "asks_size": any(k in lowered for k in INTENT_KEYWORDS["asks_size"]),
        "asks_delivery": any(k in lowered for k in INTENT_KEYWORDS["asks_delivery"]),
        "has_complaint": any(k in lowered for k in INTENT_KEYWORDS["has_complaint"]),
    }
    
    # 2. Extract multiple detected colors
    detected_colors = []
    for color_name, keywords in COLOR_MAP.items():
        if any(re.search(rf"\b{re.escape(kw)}\b", lowered) or kw in lowered for kw in keywords):
            detected_colors.append(color_name)
            
    # 3. Extract multiple detected sizes
    detected_sizes = []
    for size_name, keywords in SIZE_MAP.items():
        for kw in keywords:
            if len(kw) <= 3:
                pattern = rf"\b{re.escape(kw)}\b"
            else:
                pattern = re.escape(kw)
            if re.search(pattern, lowered):
                detected_sizes.append(size_name)
                break
                
    analysis["detected_colors"] = detected_colors
    analysis["detected_sizes"] = detected_sizes
    
    return analysis

def analyze_and_update_comment(comment: InstagramComment) -> InstagramComment:
    results = analyze_text(comment.text)
    
    comment.asks_price = results["asks_price"]
    comment.asks_availability = results["asks_availability"]
    comment.asks_color = results["asks_color"]
    comment.asks_size = results["asks_size"]
    comment.asks_delivery = results["asks_delivery"]
    comment.has_complaint = results["has_complaint"]
    comment.detected_colors = results["detected_colors"]
    comment.detected_sizes = results["detected_sizes"]
    
    comment.analysis_payload = results
    comment.save()
    return comment
