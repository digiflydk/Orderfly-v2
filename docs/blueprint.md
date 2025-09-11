# **App Name**: Orderfly Studio Base

## Core Features:

- Health Endpoint: Provides a /api/health endpoint returning a JSON response indicating the application's status.
- Error Boundaries: Implements error boundaries to catch and display errors on the root (/) and /superadmin routes, enhancing user experience and debugging.
- Stable Dev Server: Configures the development server with specific settings (port 9103, CORS, disabled file cache) to ensure stability and prevent common development issues.
- Dependency Management: Sets up all necessary dependencies, as specified, to ensure compatibility and prevent 'module not found' errors when migrating existing code.
- Environment Configuration: Utilizes environment variables (via .env.example) and Next.js configurations to manage development origins and server-only libraries.

## Style Guidelines:

- Primary color: Vivid Orange (#FF7F50) to evoke energy and innovation.
- Background color: Off-white (#FAFAFA), a subtle, muted tone allowing content to stand out without being visually overwhelming.
- Accent color: Sky Blue (#87CEEB) for interactive elements and highlights, providing a complementary contrast.
- Body and headline font: 'Inter', a sans-serif font offering a modern, machined, objective, and neutral aesthetic suitable for both headlines and body text.
- Code font: 'Source Code Pro' for displaying code snippets, to match the aesthetic requested in the prompt.
- Clean, minimalist layout to prioritize content and improve user experience. The layout employs strategic spacing, padding, and content organization techniques.