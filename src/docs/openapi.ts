export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Temple Platform Backend API',
    version: '1.0.0',
    description:
      'Multi-temple platform REST API for devotees, temple administrators, and platform operators.',
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1 root',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Ed25519 signed JWT access token',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'refreshToken',
        description: 'HttpOnly refresh token cookie',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Invalid request input' },
              details: { type: 'object' },
            },
            required: ['code', 'message'],
          },
        },
      },
      Temple: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          slug: { type: 'string', example: 'guruvayur-sree-krishna' },
          name: { type: 'string', example: 'Guruvayur Sree Krishna Temple' },
          nameMl: { type: 'string', example: 'ഗുരുവായൂർ ശ്രീകൃഷ്ണ ക്ഷേത്രം' },
          deity: { type: 'string', example: 'Lord Krishna' },
          addressLine: { type: 'string' },
          district: { type: 'string', example: 'Thrissur' },
          state: { type: 'string', example: 'Kerala' },
          pincode: { type: 'string', example: '680101' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          coverImageUrl: { type: 'string', format: 'uri' },
          openingHours: { type: 'object' },
        },
      },
      Pooja: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Palpayasam Nivedyam' },
          nameMl: { type: 'string' },
          description: { type: 'string' },
          pricePaise: { type: 'integer', example: 10000, description: 'Price in paise (100 INR)' },
          durationMinutes: { type: 'integer' },
          maxDevoteesPerBooking: { type: 'integer', example: 5 },
          requiresBooking: { type: 'boolean', example: true },
        },
      },
      Booking: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          code: { type: 'string', example: 'TMP-8K3Q9X' },
          bookingDate: { type: 'string', format: 'date' },
          startTime: { type: 'string', example: '08:30' },
          devoteeCount: { type: 'integer', example: 2 },
          totalPaise: { type: 'integer', example: 20000 },
          status: {
            type: 'string',
            enum: ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
          },
          qrPayload: { type: 'string', description: 'HMAC-signed QR payload for counter check-in' },
        },
      },
    },
  },
  paths: {
    '/auth/otp/request': {
      post: {
        tags: ['Auth'],
        summary: 'Request 6-digit email OTP',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { email: { type: 'string', format: 'email' } },
                required: ['email'],
              },
            },
          },
        },
        responses: {
          200: { description: 'OTP sent if email valid' },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
    '/auth/otp/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify OTP and obtain tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  code: { type: 'string', example: '123456' },
                },
                required: ['email', 'code'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Verified; returns user profile and access/refresh tokens' },
          400: { description: 'Invalid or expired OTP' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate refresh token and get new access token',
        responses: {
          200: { description: 'New token pair' },
          401: { description: 'Invalid token or token reuse detected' },
        },
      },
    },
    '/me': {
      get: {
        tags: ['Profile'],
        summary: 'Get current logged in user profile',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Current profile' } },
      },
      patch: {
        tags: ['Profile'],
        summary: 'Update current user profile',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Updated profile' } },
      },
      delete: {
        tags: ['Profile'],
        summary: 'Delete and anonymize account (Play Store compliance)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Account deleted' } },
      },
    },
    '/temples': {
      get: {
        tags: ['Temples'],
        summary: 'Public list of active temples with filters and cursor pagination',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'district', in: 'query', schema: { type: 'string' } },
          { name: 'deity', in: 'query', schema: { type: 'string' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Paginated temples' } },
      },
    },
    '/temples/{idOrSlug}': {
      get: {
        tags: ['Temples'],
        summary: 'Full details of a single temple by ID or Slug',
        parameters: [{ name: 'idOrSlug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Temple details' }, 404: { description: 'Not found' } },
      },
    },
    '/temples/{id}/poojas': {
      get: {
        tags: ['Poojas'],
        summary: 'Weekly offerings and poojas for a temple',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'List of poojas' } },
      },
    },
    '/poojas/{id}/availability': {
      get: {
        tags: ['Poojas'],
        summary: 'Slot availability and seats remaining for a pooja',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: { 200: { description: 'Available dates and slot inventory' } },
      },
    },
    '/bookings': {
      post: {
        tags: ['Bookings'],
        summary: 'Create a pooja booking with atomic slot reservation',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
        responses: {
          201: { description: 'Booking confirmed' },
          409: { description: 'SLOT_FULL: slot is full or blocked' },
        },
      },
      get: {
        tags: ['Bookings'],
        summary: 'List own bookings',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Devotee bookings' } },
      },
    },
    '/admin/temples/{templeId}/bookings/check-in': {
      post: {
        tags: ['Temple Staff'],
        summary: 'Scan and verify devotee QR code at temple counter',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'templeId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Check-in result' } },
      },
    },
    '/super/temples': {
      post: {
        tags: ['Super Admin'],
        summary: 'Provision a new temple in DRAFT status',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Temple created' } },
      },
    },
  },
};
