import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Base directory
BASE_DIR = Path(__file__).parent.parent

# Flask Configuration
SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key')
UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', str(BASE_DIR / 'uploads'))
ALLOWED_EXTENSIONS = {'mp4', 'mov', 'avi', 'mkv'}
MAX_CONTENT_LENGTH = int(os.environ.get('MAX_CONTENT_LENGTH', 100 * 1024 * 1024))  # 100MB

# Google Cloud Storage Configuration
GCS_CREDENTIALS_PATH = os.environ.get('GCS_CREDENTIALS_PATH', '/Users/greg/Downloads/Apps/summarizer/recolekt-storage-admin.json')
GCS_ANALYSIS_BUCKET = os.environ.get('GCS_ANALYSIS_BUCKET', 'recolekt-analysis')
GCS_VIDEOS_BUCKET = os.environ.get('GCS_VIDEOS_BUCKET', 'recolekt-analysis')

# Deepgram Configuration
DEEPGRAM_API_KEY = os.environ.get('DEEPGRAM_API_KEY', '884b903541f3e79745386c3e77507d746c79a527')

# API Configuration
API_LIMIT_PER_MINUTE = int(os.environ.get('API_LIMIT_PER_MINUTE', 50))

# Model Configuration
TRANSFORMERS_MODEL_DEVICE = int(os.environ.get('TRANSFORMERS_MODEL_DEVICE', -1))  # -1 for CPU
TOPIC_CLASSIFIER_MODEL = os.environ.get('TOPIC_CLASSIFIER_MODEL', 'typeform/distilbert-base-uncased-mnli')
SUMMARIZER_MODEL = os.environ.get('SUMMARIZER_MODEL', 'sshleifer/distilbart-cnn-12-6')
OBJECT_DETECTION_MODEL = os.environ.get('OBJECT_DETECTION_MODEL', 'facebook/detr-resnet-50')

# Instagram Reel Thumbnail Configuration
REEL_ASPECT_RATIO = (9, 16)
REEL_THUMBNAIL_WIDTH = 350
REEL_THUMBNAIL_HEIGHT = int(REEL_THUMBNAIL_WIDTH * REEL_ASPECT_RATIO[1] / REEL_ASPECT_RATIO[0])

# Instagram-specific Configuration
INSTAGRAM_SUPPORTED = True
INSTAGRAM_USE_COOKIES = False  # Set to False as per your preference

# Topic Categories
TOPIC_CATEGORIES = {
    "Fitness": [
        "Strength Training", "Cardio", "Flexibility", "Yoga", "Pilates", 
        "CrossFit", "HIIT", "Bodyweight Exercises", "Resistance Training",
        "Warm-up", "Cool-down", "Recovery", "Nutrition Advice"
    ],
    "Cooking": [
        "Baking", "Grilling", "Vegetarian", "Vegan", "Quick Meals", 
        "Gourmet", "Desserts", "Appetizers", "Main Courses", 
        "Kitchen Tips", "Food Presentation", "Meal Prep"
    ],
    "Travel": [
        "Adventure Travel", "Beach Vacation", "City Tour", "Cultural Experience",
        "Budget Travel", "Luxury Travel", "Travel Tips", "Packing Advice",
        "Local Cuisine", "Historical Sites", "Nature Exploration"
    ],
    "Technology": [
        "Programming", "Software Review", "Hardware", "AI & ML", 
        "Mobile Apps", "Web Development", "Cybersecurity", "Tech Tips",
        "Gadgets", "Digital Privacy", "Data Science"
    ],
    "Health": [
        "Mental Health", "Physical Wellness", "Medical Advice", "Preventive Care",
        "Alternative Medicine", "Sleep Health", "Stress Management", 
        "Healthy Aging", "Nutrition Science", "Disease Prevention"
    ],
    "General": [
        "Education", "Entertainment", "Lifestyle", "DIY", "Finance",
        "Career Development", "Personal Growth", "Social Media"
    ]
}

# Exercise Action Categories
EXERCISE_ACTIONS = [
    "Push-ups", "Squats", "Lunges", "Planks", "Burpees", "Jumping Jacks",
    "Pull-ups", "Dips", "Crunches", "Leg Raises", "Mountain Climbers",
    "Bicep Curls", "Tricep Extensions", "Shoulder Press", "Deadlifts",
    "Bench Press", "Rows", "Yoga Poses", "Stretching", "Running", "Cycling"
]

# Exercise Equipment
EXERCISE_EQUIPMENT = [
    "Dumbbells", "Barbell", "Kettlebell", "Resistance Bands", "Yoga Mat",
    "Treadmill", "Exercise Bike", "Elliptical", "Pull-up Bar", "Bench",
    "Medicine Ball", "Foam Roller", "Jump Rope", "Stability Ball"
]

# Suppress warnings
os.environ['PYTHONWARNINGS'] = 'ignore'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
