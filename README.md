# Orbit Messenger

A mobile-first messenger starter built with React, TypeScript, Vite and Supabase.

## Included
- Responsive dark UI designed for iPhone Safari and desktop.
- Supabase email/password authentication.
- Private chat and message schema with Row Level Security (RLS).
- Realtime message subscription.
- WebRTC voice/video call controls and signaling foundation.
- No service-role key in the browser.

## Run locally
1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill in your Supabase project URL and anon/publishable key.
4. Run the SQL in `supabase/schema.sql` in the Supabase SQL Editor.
5. Run `npm run dev`.

## Important
Calling requires a secure context (HTTPS, or localhost), microphone/camera permissions, and STUN/TURN connectivity. iOS Safari behavior depends on browser permissions and device/network support. This repository provides the call UI and WebRTC signaling foundation; production-grade background/locked-screen calling and push notifications require a native iOS app or additional push/call infrastructure.

## Deploy
Build with `npm run build`. You can host the built app on a static host that supports HTTPS. Configure the same environment variables in the hosting provider.
