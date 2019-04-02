import functions from '../handlers/authentication.js';

const Joi = require('joi');

const auth = [{
    method: 'GET',
    path: '/authenticate/{email}',
    handler: functions.authenticateEmail,
    options: {
        tags: [
            'api'
        ],
        validate: {
            params: {
                email: Joi.string().regex(/^[a-z0-9](\.?[a-z0-9]){5,}@gmail\.com$/i)
            }
        }
    }
}
];

export default auth;
