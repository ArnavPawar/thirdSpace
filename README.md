# thirdSpace
Find thirdSpaces near you

A React Native app built with Expo for discovering, rating, and ranking third spaces like cafes, parks, libraries, and coworking spaces based on atmosphere and utility.

## Tech Stack

- **Frontend**: Expo with TypeScript and Expo Router
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Maps**: React Native Maps
- **Backend**: Supabase (PostgreSQL)
- **Icons**: Lucide React Native

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your Supabase credentials:
   ```
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### 3. Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Run the SQL schema in `supabase/schema.sql` in your Supabase SQL Editor
3. Update your `.env` file with the project URL and anon key

### 4. Run the App

```bash
# Start the development server
npm start

# Run on specific platforms
npm run ios      # iOS Simulator
npm run android  # Android Emulator
npm run web      # Web browser
```

### 5. Location Permissions

The app requests location permissions to center the map on your current position. If denied, it defaults to Arlington, Virginia.

## Project Structure

```
├── app/                    # Expo Router file-based routing
│   ├── _layout.tsx        # Root layout
│   └── (tabs)/            # Tab navigation
│       ├── _layout.tsx    # Tab layout
│       ├── index.tsx      # Feed (Social)
│       ├── map.tsx        # Map view
│       ├── rank.tsx       # Ranking interface
│       └── profile.tsx    # User profile
├── components/            # Reusable components
│   ├── SpaceCard.tsx     # Third space display card
│   └── VibeSlider.tsx    # Rating slider component
├── lib/                  # Utilities and configurations
│   └── supabase.ts       # Supabase client
├── types/                # TypeScript type definitions
│   └── space.ts          # Space-related types
└── supabase/             # Database schema and migrations
    └── schema.sql        # Initial database schema
```

## Features

- **Social Feed**: See recent space ratings from the community
- **Interactive Map**: Discover third spaces near you with real-time location
- **Rating System**: Rate spaces on Wi-Fi, noise level, seating, comfort, and utility
- **Personal Rankings**: Build and manage your personal list of favorite spaces

## Development

```bash
# Type checking
npm run type-check

# Linting
npm run lint
```
