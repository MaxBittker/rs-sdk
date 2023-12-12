import path from 'path';

import Fastify from 'fastify';
import FormBody from '@fastify/formbody';
import Multipart from '@fastify/multipart';
import Autoload from '@fastify/autoload';
import Static from '@fastify/static';
import View from '@fastify/view';
import Cookie from '@fastify/cookie';
import Session from '@fastify/session';
import Cors from '@fastify/cors';
import ejs from 'ejs';

let fastify = Fastify({
    autoload: 15000
});

fastify.register(FormBody);
fastify.register(Multipart);

fastify.register(Autoload, {
    dir: path.join(process.cwd(), 'src', 'lostcity', 'web', 'routes')
});

fastify.register(Static, {
    root: path.join(process.cwd(), 'public')
});

fastify.register(View, {
    engine: {
        ejs
    },
    root: path.join(process.cwd(), 'view'),
    viewExt: 'ejs'
});

fastify.register(Cookie);
fastify.register(Session, {
    secret: 'qxG38pWSAW5u6XS5pJS7jrSqwxbFgQdH',
    cookie: {
        secure: false
    }
});

fastify.register(Cors, {
    origin: '*',
    methods: ['GET']
});

export function startWeb() {
    fastify.listen({ port: process.env.WEB_PORT, host: '0.0.0.0' }, (err, address) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }

        console.log(`[Web]: Listening on port ${Number(process.env.WEB_PORT)}`);
    });
}
