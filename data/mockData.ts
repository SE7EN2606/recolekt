import { Video, Folder } from '../types';

export const MOCK_VIDEOS: Video[] = [
  {
    id: '1',
    title: 'Master Kettlebell Elbow Placement for Safer Lifts',
    author: '@maximilianmoves',
    platform: 'instagram',
    thumbnailUrl: 'https://picsum.photos/400/711?random=1',
    duration: '0:45',
    savedAt: '2025-11-19',
    category: 'Fitness',
    subCategory: 'Technique',
    tags: ['#kettlebell', '#workout', '#homeworkout', '#formtips'],
    summary: 'Improper elbow placement during compound kettlebell moves like push presses is a frequent error. Keeping elbows close ensures compactness and efficiency.',
    bullets: [
      'Avoid flaring elbows to prevent injury.',
      'Keep the core tight for better power transfer.',
      'Compact = Strong.'
    ],
    transcript: "Let's talk about elbow placement. When performing compound kettlebell movements like push presses, snatches, and swings, elbow placement is a key detail that makes all the difference in both performance and safety. Keeping your elbow close to your body — especially near the hips during the swing or clean phase — helps you stay compact, efficient, and powerful.",
    originalUrl: 'https://instagram.com/reel/123456',
    views: '1.2M',
    isFavorite: false,
    folderId: 'all'
  },
  {
    id: '2',
    title: 'Irresistible Ultra-Moist Pumpkin Bars',
    author: '@lifeloveandsugar',
    platform: 'instagram',
    thumbnailUrl: 'https://picsum.photos/400/711?random=2',
    duration: '1:15',
    savedAt: '2025-11-20',
    category: 'Food',
    subCategory: 'Baking',
    tags: ['#pumpkin', '#fallrecipes', '#baking', '#dessert'],
    summary: 'These ultra-moist pumpkin bars are everything you need for fall. Loaded with warming spices and crowned with cream cheese frosting.',
    bullets: [
      'No mixer required for the batter.',
      'Perfect blend of cake and brownie texture.',
      'Best served chilled.'
    ],
    transcript: "These ultra-moist pumpkin bars are everything you didn't know you needed. Loaded with warming fall spices, baked into the perfect texture (not quite cake, not quite brownie), and crowned with a dreamy cream cheese frosting that's sweet, tangy, and absolutely irresistible. They're simple to make (no mixer required!), but they deliver all the autumn vibes.",
    originalUrl: 'https://instagram.com/reel/pumpkin',
    views: '850K',
    isFavorite: true,
    folderId: 'all',
    favoritedAt: '2025-11-21T10:00:00Z'
  },
  {
    id: '3',
    title: 'Styling Oversized Blazers for Work',
    author: '@stylebyanna',
    platform: 'tiktok',
    thumbnailUrl: 'https://picsum.photos/400/711?random=3',
    duration: '0:30',
    savedAt: '2025-11-21',
    category: 'Fashion',
    subCategory: 'Workwear',
    tags: ['#ootd', '#fashionhacks', '#blazer', '#office'],
    summary: 'Three ways to wear an oversized blazer without looking drowning in fabric. Belt it, pair with slim trousers, or use a sleeve tuck.',
    bullets: [
      'Use a belt to define the waist.',
      'Balance volume with slim bottoms.',
      'Roll sleeves to show wrists.'
    ],
    transcript: "Here are three ways to style an oversized blazer for the office. First, belt it at the waist to create a silhouette. Second, pair it with slim trousers or leggings to balance the volume. Finally, use the hair tie trick to keep your sleeves rolled up.",
    originalUrl: 'https://tiktok.com/@stylebyanna/video/123',
    views: '2.1M',
    isFavorite: false,
    folderId: 'all'
  },
  {
    id: '4',
    title: 'Investment Strategies for 2026',
    author: '@financebro',
    platform: 'youtube',
    thumbnailUrl: 'https://picsum.photos/400/711?random=4',
    duration: '0:59',
    savedAt: '2025-11-22',
    category: 'Finance',
    subCategory: 'Investing',
    tags: ['#stocks', '#crypto', '#etf', '#money'],
    summary: 'A quick overview of sector rotation expected in early 2026 focusing on tech and renewable energy.',
    bullets: [
      'Tech sector expected to rebound.',
      'Renewables seeing higher government subsidies.',
      'Diversify with index funds.'
    ],
    transcript: "Let's talk about where the smart money is going in 2026. We are seeing a massive rotation back into technology after the correction, specifically in AI infrastructure. Secondly, renewable energy storage is getting huge subsidies. Don't put all your eggs in one basket.",
    originalUrl: 'https://youtube.com/shorts/123',
    views: '500K',
    isFavorite: false,
    folderId: 'all'
  },
  {
    id: '5',
    title: 'Festive Turkey Cupcakes',
    author: '@bakerjoy',
    platform: 'instagram',
    thumbnailUrl: 'https://picsum.photos/400/711?random=5',
    duration: '0:50',
    savedAt: '2025-11-22',
    category: 'Food',
    subCategory: 'Decoration',
    tags: ['#thanksgiving', '#cupcakes', '#turkey', '#kidsbaking'],
    summary: 'Cute turkey designs using candy corn and chocolate frosting. Fun activity for kids.',
    bullets: [
      'Use candy corn for feathers.',
      'Chocolate frosting for the body.',
      'Edible eyes complete the look.'
    ],
    transcript: "Look at these festive turkey cupcakes! Start with a chocolate base. Pipe a high swirl of frosting. Place candy corn in a fan shape at the back. Add eyes and a beak. So simple and the kids love them.",
    originalUrl: 'https://instagram.com/reel/turkey',
    views: '300K',
    isFavorite: false,
    folderId: 'all'
  }
];

export const MOCK_FOLDERS: Folder[] = [
  { id: 'all', name: 'All my videos', itemCount: 124, coverUrl: '' },
  { id: 'fav', name: 'Favorites', itemCount: 12, coverUrl: '' },
  {
    id: 'travel',
    name: 'Travel',
    itemCount: 45,
    subFolders: [
      { id: 'japan', name: 'Japan Trip', itemCount: 10 },
      { id: 'europe', name: 'Europe Summer', itemCount: 35 }
    ]
  },
  {
    id: 'food',
    name: 'Food',
    itemCount: 89,
    subFolders: [
      { id: 'french', name: 'French Cuisine', itemCount: 12 },
      { id: 'mealprep', name: 'Meal Prep', itemCount: 20 }
    ]
  },
  { id: 'shared', name: 'Shared with Me', itemCount: 5 },
];