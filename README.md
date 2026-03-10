# v

## Overview

Promark AI is an AI-driven solution designed to simplify, automate, and accelerate the creation of highly targeted marketing content for product campaigns. By combining deep customer insights with strict brand guardrails, the platform empowers marketing teams to deploy multi-channel campaigns with unprecedented speed and scale.

## Core Mechanics & Workflow

### 1. Unified Brand Foundation (Guardrails)

To ensure the AI produces outputs that are safe, consistent, and on-brand, the platform is grounded in global settings that serve as constraints and stylistic guides for the AI:

- **Tone and Voice**: Defines the personality, vocabulary, and communication style of the brand.
- **Brand Visuals**: Aesthetic principles, color palettes, typography, and logo usage guidelines.
- **Content Guidelines**: Structural rules, do's and don'ts, regulatory compliance, and brand-specific formatting.

### 2. Campaign Context & Setup

For every new marketing push, users provide specific context to inform the AI generation:

- **Product Information**: Key features, unique selling propositions (USPs), value drivers, and pricing.
- **Campaign Details**: Overall objectives, core messaging pillars, call-to-actions (CTAs), and timelines.
- **Research & Background**: Market context, historical performance data, and competitive landscape.
- **Customer Segmentation**: Deep audience profiling based on:
  - _Quantitative Attributes_: Demographics, purchase history, behavior metrics.
  - _Qualitative Attributes_: Psychographics, pain points, motivations, and interests.

### 3. Intelligent Engine Output

Using the brand foundation and campaign context, the AI generates personalized, ready-to-publish assets:

- **Hyper-Personalized Copy**: Distinct messaging variations tailored specifically to each defined customer segment.
- **Multi-Channel Adaptation**: Content natively formatted for various distribution channels (e.g., Social Media posts, Email sequences, Website banners, Ad copy).
- **Visual Asset Generation**: Key visual concepts, including generated images and video storyboards/assets, perfectly paired with the generated copy.

## Project Goals

- **Speed to Market**: Drastically reduce the time it takes to go from campaign ideation to execution.
- **Consistent Brand Identity**: Eliminate off-brand messaging through strict AI guardrails.
- **Increased Engagement**: Drive higher conversion rates through hyper-personalized messaging scaling across segments.

## Data Schema

The platform relies on Supabase for its backend, utilizing the following core tables (mapped to TypeScript interfaces in `types/models.ts`):

- **Project**: Represents a high-level marketing project.
- **Campaign**: Represents a specific marketing campaign within a project.
- **ProjectUser**: Maps which users have access to which projects.

## Folder Structure

The application is built with Next.js (App Router), organizing code as follows:

```text
.
├── app/                  # Next.js App Router pages and API routes
│   ├── login/            # Authentication pages
│   ├── project/          # Project and campaign management pages
│   ├── user/             # User settings and profile pages
│   ├── layout.tsx        # Global application layout
│   └── page.tsx          # Main dashboard page
├── components/           # Reusable React components (UI and layout)
│   ├── ui/               # Base visual components (e.g., shadcn/ui)
│   ├── header.tsx        # Global header component
│   ├── sidebar.tsx       # Global sidebar navigation
│   └── metric-card.tsx   # Dashboard data display card
├── lib/                  # Utility functions and shared logic (e.g., tailwind `cn`)
├── public/               # Static assets (images, logos, icons)
├── types/                # TypeScript type definitions and POJOs
│   └── models.ts         # TypeScript interfaces for database schema
└── utils/
    └── supabase/         # Supabase client instantiation and auth helpers
```

## Documentation

- [Architecture design](docs/architecture.md)
