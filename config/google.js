const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// Check if Google OAuth credentials are configured
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('⚠️  Google OAuth credentials not found in .env file');
  console.warn('   Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  console.warn('   See .env.example for reference');
}

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || 'placeholder_client_id',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'placeholder_client_secret',
  callbackURL: "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Here you would typically find or create a user in your database
    // For now, we'll just pass the profile information
    return done(null, {
      id: profile.id,
      name: profile.displayName,
      email: profile.emails[0].value,
      avatar: profile.photos[0].value
    });
  } catch (error) {
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});
