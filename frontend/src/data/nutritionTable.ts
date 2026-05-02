export type NutritionPer100g = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  saturates_g?: number;
  sugars_g?: number;
  salt_g?: number;
};

export const nutritionTable: Record<string, NutritionPer100g> = {
  "chicken stock": { calories: 36, protein_g: 2.5, carbs_g: 3.5, fat_g: 1.2, salt_g: 0.4 },

  "skyr": { calories: 63, protein_g: 11, carbs_g: 4, fat_g: 0.2, sugars_g: 4 },
  "nonfat yogurt": { calories: 59, protein_g: 10, carbs_g: 3.6, fat_g: 0.4, sugars_g: 3.2 },
  "dijon mustard": { calories: 66, protein_g: 4.4, carbs_g: 5.8, fat_g: 3.3, salt_g: 5.7 },
  "honey": { calories: 304, protein_g: 0.3, carbs_g: 82.4, fat_g: 0, sugars_g: 82.1 },
  "worcestershire sauce": { calories: 78, protein_g: 0, carbs_g: 19, fat_g: 0, sugars_g: 10, salt_g: 2.5 },
  "paprika": { calories: 282, protein_g: 14.1, carbs_g: 54, fat_g: 12.9 },
  "apple cider vinegar": { calories: 21, protein_g: 0, carbs_g: 0.9, fat_g: 0 },
  "chicken thigh": { calories: 209, protein_g: 17.3, carbs_g: 0, fat_g: 15.5 },
  "chicken breast": { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
  "garlic": { calories: 149, protein_g: 6.4, carbs_g: 33.1, fat_g: 0.5 },
  "olive oil": { calories: 884, protein_g: 0, carbs_g: 0, fat_g: 100, saturates_g: 13.8 },
  "butter": { calories: 717, protein_g: 0.9, carbs_g: 0.1, fat_g: 81, saturates_g: 51 },
  "onion": { calories: 40, protein_g: 1.1, carbs_g: 9.3, fat_g: 0.1, sugars_g: 4.2 },
  "tomato": { calories: 18, protein_g: 0.9, carbs_g: 3.9, fat_g: 0.2, sugars_g: 2.6 },
  "pasta": { calories: 371, protein_g: 13, carbs_g: 75, fat_g: 1.5 },
  "flour": { calories: 364, protein_g: 10, carbs_g: 76, fat_g: 1 },
  "egg": { calories: 143, protein_g: 13, carbs_g: 0.7, fat_g: 9.5 },
  "milk": { calories: 61, protein_g: 3.2, carbs_g: 4.8, fat_g: 3.3 },
  "cream": { calories: 340, protein_g: 2.1, carbs_g: 2.8, fat_g: 36 },
  "lemon": { calories: 29, protein_g: 1.1, carbs_g: 9.3, fat_g: 0.3 },
  "salt": { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, salt_g: 100 },
  "pepper": { calories: 251, protein_g: 10.4, carbs_g: 64, fat_g: 3.3 },
  "thyme": { calories: 101, protein_g: 5.6, carbs_g: 24.5, fat_g: 1.7 },
  "bay leaf": { calories: 313, protein_g: 7.6, carbs_g: 75, fat_g: 8.4 },
  "duck fat": { calories: 882, protein_g: 0, carbs_g: 0, fat_g: 99.8, saturates_g: 33.2 },
  "rice": { calories: 365, protein_g: 7.1, carbs_g: 80, fat_g: 0.7 },
  "potato": { calories: 77, protein_g: 2, carbs_g: 17, fat_g: 0.1 },
  "carrot": { calories: 41, protein_g: 0.9, carbs_g: 9.6, fat_g: 0.2, sugars_g: 4.7 },
  "salmon": { calories: 208, protein_g: 20, carbs_g: 0, fat_g: 13 },
  "shrimp": { calories: 99, protein_g: 24, carbs_g: 0.2, fat_g: 0.3 },
  "beef mince": { calories: 254, protein_g: 17.2, carbs_g: 0, fat_g: 20 },
  "parmesan": { calories: 431, protein_g: 38, carbs_g: 4.1, fat_g: 29 },
  "mozzarella": { calories: 280, protein_g: 28, carbs_g: 3.1, fat_g: 17 }
};
