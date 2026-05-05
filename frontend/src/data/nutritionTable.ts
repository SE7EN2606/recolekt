export type NutritionPer100g = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  saturates_g?: number;
  sugars_g?: number;
  salt_g?: number;
  fiber_g?: number;
  isFruitVegNutPulseOil?: boolean;
};

export const nutritionTable: Record<string, NutritionPer100g> = {
  // Proteins
  "chicken thigh": { calories: 209, protein_g: 18.6, carbs_g: 0, fat_g: 15.5, saturates_g: 4.3 },
  "chicken breast": { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, saturates_g: 1 },
  "chicken stock": { calories: 36, protein_g: 2.5, carbs_g: 3.5, fat_g: 1.2, salt_g: 0.4 },
  "beef mince": { calories: 254, protein_g: 17.2, carbs_g: 0, fat_g: 20, saturates_g: 7.7 },
  "steak": { calories: 271, protein_g: 25, carbs_g: 0, fat_g: 19, saturates_g: 7 },
  "pork": { calories: 242, protein_g: 27, carbs_g: 0, fat_g: 14, saturates_g: 5 },
  "bacon": { calories: 541, protein_g: 37, carbs_g: 1.4, fat_g: 42, saturates_g: 14, salt_g: 4.2 },
  "egg": { calories: 143, protein_g: 13, carbs_g: 0.7, fat_g: 9.5, saturates_g: 3.1 },
  "salmon": { calories: 208, protein_g: 20, carbs_g: 0, fat_g: 13, saturates_g: 3.1 },
  "tuna": { calories: 132, protein_g: 28, carbs_g: 0, fat_g: 1.3, saturates_g: 0.3 },
  "cod": { calories: 82, protein_g: 18, carbs_g: 0, fat_g: 0.7, saturates_g: 0.1 },
  "shrimp": { calories: 99, protein_g: 24, carbs_g: 0.2, fat_g: 0.3, saturates_g: 0.1 },
  "tofu": { calories: 76, protein_g: 8, carbs_g: 1.9, fat_g: 4.8, saturates_g: 0.7, fiber_g: 0.3 },
  "lentils": { calories: 116, protein_g: 9, carbs_g: 20, fat_g: 0.4, fiber_g: 7.9, isFruitVegNutPulseOil: true },
  "chickpeas": { calories: 164, protein_g: 8.9, carbs_g: 27, fat_g: 2.6, fiber_g: 7.6, isFruitVegNutPulseOil: true },
  "beans": { calories: 127, protein_g: 8.7, carbs_g: 22.8, fat_g: 0.5, fiber_g: 6.4, isFruitVegNutPulseOil: true },

  // Dairy
  "milk": { calories: 61, protein_g: 3.2, carbs_g: 4.8, fat_g: 3.3, saturates_g: 1.9, sugars_g: 5 },
  "nonfat yogurt": { calories: 59, protein_g: 10, carbs_g: 3.6, fat_g: 0.4, sugars_g: 3.2 },
  "skyr": { calories: 63, protein_g: 11, carbs_g: 4, fat_g: 0.2, sugars_g: 4 },
  "greek yogurt": { calories: 97, protein_g: 9, carbs_g: 3.6, fat_g: 5, saturates_g: 3.3, sugars_g: 3.2 },
  "cream": { calories: 340, protein_g: 2.1, carbs_g: 2.8, fat_g: 36, saturates_g: 23, sugars_g: 2.8 },
  "butter": { calories: 717, protein_g: 0.9, carbs_g: 0.1, fat_g: 81, saturates_g: 51 },
  "parmesan": { calories: 431, protein_g: 38, carbs_g: 4.1, fat_g: 29, saturates_g: 17, salt_g: 4 },
  "mozzarella": { calories: 280, protein_g: 28, carbs_g: 3.1, fat_g: 17, saturates_g: 11, salt_g: 1.6 },
  "cheddar": { calories: 403, protein_g: 25, carbs_g: 1.3, fat_g: 33, saturates_g: 19, salt_g: 1.8 },
  "feta": { calories: 264, protein_g: 14, carbs_g: 4.1, fat_g: 21, saturates_g: 15, salt_g: 2.8 },

  // Fats and sauces
  "olive oil": { calories: 884, protein_g: 0, carbs_g: 0, fat_g: 100, saturates_g: 13.8, isFruitVegNutPulseOil: true },
  "rapeseed oil": { calories: 884, protein_g: 0, carbs_g: 0, fat_g: 100, saturates_g: 7.4, isFruitVegNutPulseOil: true },
  "sunflower oil": { calories: 884, protein_g: 0, carbs_g: 0, fat_g: 100, saturates_g: 10.3 },
  "duck fat": { calories: 882, protein_g: 0, carbs_g: 0, fat_g: 99.8, saturates_g: 33.2 },
  "mayonnaise": { calories: 680, protein_g: 1, carbs_g: 0.6, fat_g: 75, saturates_g: 11, salt_g: 1.4 },
  "dijon mustard": { calories: 66, protein_g: 4.4, carbs_g: 5.8, fat_g: 3.3, salt_g: 5.7, fiber_g: 3.3 },
  "honey": { calories: 304, protein_g: 0.3, carbs_g: 82.4, fat_g: 0, sugars_g: 82.1 },
  "worcestershire sauce": { calories: 78, protein_g: 0, carbs_g: 19, fat_g: 0, sugars_g: 10, salt_g: 2.5 },
  "soy sauce": { calories: 53, protein_g: 8, carbs_g: 4.9, fat_g: 0.6, sugars_g: 0.4, salt_g: 14 },
  "ketchup": { calories: 112, protein_g: 1.3, carbs_g: 26, fat_g: 0.2, sugars_g: 22.8, salt_g: 2.3 },
  "apple cider vinegar": { calories: 21, protein_g: 0, carbs_g: 0.9, fat_g: 0 },

  // Grains and starches
  "rice": { calories: 365, protein_g: 7.1, carbs_g: 80, fat_g: 0.7, fiber_g: 1.3 },
  "brown rice": { calories: 370, protein_g: 7.9, carbs_g: 77, fat_g: 2.9, fiber_g: 3.5 },
  "pasta": { calories: 371, protein_g: 13, carbs_g: 75, fat_g: 1.5, fiber_g: 3.2 },
  "whole wheat pasta": { calories: 348, protein_g: 15, carbs_g: 70, fat_g: 2.5, fiber_g: 8 },
  "flour": { calories: 364, protein_g: 10, carbs_g: 76, fat_g: 1, fiber_g: 2.7 },
  "bread": { calories: 265, protein_g: 9, carbs_g: 49, fat_g: 3.2, sugars_g: 5, salt_g: 1.2, fiber_g: 2.7 },
  "oats": { calories: 389, protein_g: 17, carbs_g: 66, fat_g: 6.9, saturates_g: 1.2, fiber_g: 10.6 },
  "potato": { calories: 77, protein_g: 2, carbs_g: 17, fat_g: 0.1, sugars_g: 0.8, fiber_g: 2.2, isFruitVegNutPulseOil: true },
  "sweet potato": { calories: 86, protein_g: 1.6, carbs_g: 20, fat_g: 0.1, sugars_g: 4.2, fiber_g: 3, isFruitVegNutPulseOil: true },
  "corn": { calories: 86, protein_g: 3.2, carbs_g: 19, fat_g: 1.2, sugars_g: 3.2, fiber_g: 2.7, isFruitVegNutPulseOil: true },
  "tortilla": { calories: 218, protein_g: 5.7, carbs_g: 44, fat_g: 2.9, fiber_g: 2.7, salt_g: 1.2 },

  // Vegetables
  "garlic": { calories: 149, protein_g: 6.4, carbs_g: 33, fat_g: 0.5, sugars_g: 1, fiber_g: 2.1, isFruitVegNutPulseOil: true },
  "onion": { calories: 40, protein_g: 1.1, carbs_g: 9.3, fat_g: 0.1, sugars_g: 4.2, fiber_g: 1.7, isFruitVegNutPulseOil: true },
  "tomato": { calories: 18, protein_g: 0.9, carbs_g: 3.9, fat_g: 0.2, sugars_g: 2.6, fiber_g: 1.2, isFruitVegNutPulseOil: true },
  "carrot": { calories: 41, protein_g: 0.9, carbs_g: 9.6, fat_g: 0.2, sugars_g: 4.7, fiber_g: 2.8, isFruitVegNutPulseOil: true },
  "broccoli": { calories: 34, protein_g: 2.8, carbs_g: 6.6, fat_g: 0.4, sugars_g: 1.7, fiber_g: 2.6, isFruitVegNutPulseOil: true },
  "spinach": { calories: 23, protein_g: 2.9, carbs_g: 3.6, fat_g: 0.4, sugars_g: 0.4, fiber_g: 2.2, isFruitVegNutPulseOil: true },
  "mushroom": { calories: 22, protein_g: 3.1, carbs_g: 3.3, fat_g: 0.3, sugars_g: 2, fiber_g: 1, isFruitVegNutPulseOil: true },
  "zucchini": { calories: 17, protein_g: 1.2, carbs_g: 3.1, fat_g: 0.3, sugars_g: 2.5, fiber_g: 1, isFruitVegNutPulseOil: true },
  "eggplant": { calories: 25, protein_g: 1, carbs_g: 5.9, fat_g: 0.2, sugars_g: 3.5, fiber_g: 3, isFruitVegNutPulseOil: true },
  "bell pepper": { calories: 31, protein_g: 1, carbs_g: 6, fat_g: 0.3, sugars_g: 4.2, fiber_g: 2.1, isFruitVegNutPulseOil: true },
  "cucumber": { calories: 15, protein_g: 0.7, carbs_g: 3.6, fat_g: 0.1, sugars_g: 1.7, fiber_g: 0.5, isFruitVegNutPulseOil: true },
  "lettuce": { calories: 15, protein_g: 1.4, carbs_g: 2.9, fat_g: 0.2, sugars_g: 0.8, fiber_g: 1.3, isFruitVegNutPulseOil: true },
  "celery": { calories: 16, protein_g: 0.7, carbs_g: 3, fat_g: 0.2, sugars_g: 1.3, fiber_g: 1.6, isFruitVegNutPulseOil: true },
  "leek": { calories: 61, protein_g: 1.5, carbs_g: 14, fat_g: 0.3, sugars_g: 3.9, fiber_g: 1.8, isFruitVegNutPulseOil: true },
  "peas": { calories: 81, protein_g: 5.4, carbs_g: 14, fat_g: 0.4, sugars_g: 5.7, fiber_g: 5.7, isFruitVegNutPulseOil: true },

  // Fruits
  "lemon": { calories: 29, protein_g: 1.1, carbs_g: 9.3, fat_g: 0.3, sugars_g: 2.5, fiber_g: 2.8, isFruitVegNutPulseOil: true },
  "apple": { calories: 52, protein_g: 0.3, carbs_g: 14, fat_g: 0.2, sugars_g: 10.4, fiber_g: 2.4, isFruitVegNutPulseOil: true },
  "banana": { calories: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, sugars_g: 12.2, fiber_g: 2.6, isFruitVegNutPulseOil: true },
  "orange": { calories: 47, protein_g: 0.9, carbs_g: 12, fat_g: 0.1, sugars_g: 9.4, fiber_g: 2.4, isFruitVegNutPulseOil: true },
  "berries": { calories: 57, protein_g: 0.7, carbs_g: 14, fat_g: 0.3, sugars_g: 10, fiber_g: 2.4, isFruitVegNutPulseOil: true },
  "strawberry": { calories: 32, protein_g: 0.7, carbs_g: 7.7, fat_g: 0.3, sugars_g: 4.9, fiber_g: 2, isFruitVegNutPulseOil: true },
  "avocado": { calories: 160, protein_g: 2, carbs_g: 8.5, fat_g: 14.7, saturates_g: 2.1, sugars_g: 0.7, fiber_g: 6.7, isFruitVegNutPulseOil: true },

  // Nuts and seeds
  "almond": { calories: 579, protein_g: 21, carbs_g: 22, fat_g: 50, saturates_g: 3.8, fiber_g: 12.5, isFruitVegNutPulseOil: true },
  "walnut": { calories: 654, protein_g: 15, carbs_g: 14, fat_g: 65, saturates_g: 6.1, fiber_g: 6.7, isFruitVegNutPulseOil: true },
  "cashew": { calories: 553, protein_g: 18, carbs_g: 30, fat_g: 44, saturates_g: 7.8, fiber_g: 3.3, isFruitVegNutPulseOil: true },
  "peanut": { calories: 567, protein_g: 26, carbs_g: 16, fat_g: 49, saturates_g: 6.3, fiber_g: 8.5, isFruitVegNutPulseOil: true },
  "chia seeds": { calories: 486, protein_g: 17, carbs_g: 42, fat_g: 31, saturates_g: 3.3, fiber_g: 34, isFruitVegNutPulseOil: true },
  "sesame seeds": { calories: 573, protein_g: 18, carbs_g: 23, fat_g: 50, saturates_g: 7, fiber_g: 12, isFruitVegNutPulseOil: true },

  // Seasoning
  "salt": { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, salt_g: 100 },
  "pepper": { calories: 251, protein_g: 10.4, carbs_g: 64, fat_g: 3.3, fiber_g: 25 },
  "thyme": { calories: 101, protein_g: 5.6, carbs_g: 24.5, fat_g: 1.7, fiber_g: 14 },
  "bay leaf": { calories: 313, protein_g: 7.6, carbs_g: 75, fat_g: 8.4, fiber_g: 26 },
  "paprika": { calories: 282, protein_g: 14.1, carbs_g: 54, fat_g: 12.9, saturates_g: 2.1, fiber_g: 35 },
  "cumin": { calories: 375, protein_g: 18, carbs_g: 44, fat_g: 22, saturates_g: 1.5, fiber_g: 10.5 },
  "cinnamon": { calories: 247, protein_g: 4, carbs_g: 81, fat_g: 1.2, fiber_g: 53 },
  "ginger": { calories: 80, protein_g: 1.8, carbs_g: 18, fat_g: 0.8, sugars_g: 1.7, fiber_g: 2, isFruitVegNutPulseOil: true },

  // Sweeteners / baking
  "sugar": { calories: 387, protein_g: 0, carbs_g: 100, fat_g: 0, sugars_g: 100 },
  "brown sugar": { calories: 380, protein_g: 0.1, carbs_g: 98, fat_g: 0, sugars_g: 97 },
  "maple syrup": { calories: 260, protein_g: 0, carbs_g: 67, fat_g: 0, sugars_g: 60 },
  "chocolate": { calories: 546, protein_g: 4.9, carbs_g: 61, fat_g: 31, saturates_g: 19, sugars_g: 48, fiber_g: 7 },
  "dark chocolate": { calories: 598, protein_g: 7.8, carbs_g: 46, fat_g: 43, saturates_g: 24, sugars_g: 24, fiber_g: 11 },
  "courgette": {
    calories: 17,
    protein_g: 1.2,
    carbs_g: 3.1,
    fat_g: 0.3,
    saturates_g: 0.1,
    sugars_g: 2.5,
    salt_g: 0.02,
    fiber_g: 1,
    isFruitVegNutPulseOil: true,
  },
  "cottage cheese": {
    calories: 98,
    protein_g: 11.1,
    carbs_g: 3.4,
    fat_g: 4.3,
    saturates_g: 1.7,
    sugars_g: 2.7,
    salt_g: 0.36,
    fiber_g: 0,
  },
  "turkey breast": {
    calories: 135,
    protein_g: 29,
    carbs_g: 0,
    fat_g: 1.5,
    saturates_g: 0.5,
    sugars_g: 0,
    salt_g: 0.1,
    fiber_g: 0,
  },
  "quark": {
    calories: 67,
    protein_g: 12,
    carbs_g: 4,
    fat_g: 0.2,
    saturates_g: 0.1,
    sugars_g: 4,
    salt_g: 0.1,
    fiber_g: 0,
  },

};
