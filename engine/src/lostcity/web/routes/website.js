import { db } from '#lostcity/db/query.js';

import WorldList from '#lostcity/engine/WorldList.js';

import Environment from '#lostcity/util/Environment.js';

export default function (f, opts, next) {
    f.get('/', async (req, res) => {
        return res.view('index');
    });

    f.get('/title', async (req, res) => {
        let playerCount = 0;
        for (let world of WorldList) {
            playerCount += world.players;
        }

        const latestNews = Environment.DB_HOST ? await db.selectFrom('newspost').orderBy('id', 'desc').limit(5).selectAll().execute() : [];
        return res.view('title', {
            playerCount,
            newsposts: latestNews
        });
    });

    f.get('/serverlist', async (req, res) => {
        if (typeof req.query['lores.x'] == 'undefined' && typeof req.query['hires.x'] == 'undefined') {
            return res.redirect(302, '/detail');
        }

        if (!req.query['lores.x'] && !req.query['hires.x']) {
            return res.redirect(302, '/detail');
        }

        if (typeof req.query.method == 'undefined' || !req.query.method.length) {
            return res.redirect(302, '/detail');
        }

        let members = WorldList.filter(x => x.members).length;
        let regions = {
            'Central USA': 'us',
            Germany: 'ger',
            'Local Development': 'uk'
        };
        let freeRegions = WorldList.filter(x => x.region && !x.members)
            .map(x => x.region)
            .filter((x, i, self) => self.indexOf(x) == i);
        let membersRegions = WorldList.filter(x => x.region && x.members)
            .map(x => x.region)
            .filter((x, i, self) => self.indexOf(x) == i);

        if (req.query.method == 3) {
            return res.redirect('/downloads');
        }

        return res.view('serverlist', {
            detail: typeof req.query['hires.x'] !== 'undefined' ? 'high' : 'low',
            method: req.query.method,
            worlds: WorldList,
            members,
            regions,
            freeRegions,
            membersRegions
        });
    });

    f.get('/play', async (req, res) => {
        return res.redirect('/detail');
    });

    f.get('/cookies', async (req, res) => {
        return res.view('cookies');
    });

    f.get('/copyright', async (req, res) => {
        return res.view('copyright');
    });

    f.get('/detail', async (req, res) => {
        return res.view('detail');
    });

    f.get('/manual', async (req, res) => {
        return res.view('manual');
    });

    f.get('/privacy', async (req, res) => {
        return res.view('privacy');
    });

    f.get('/support', async (req, res) => {
        return res.view('support');
    });

    f.get('/terms', async (req, res) => {
        return res.view('terms');
    });

    f.get('/whychoosers', async (req, res) => {
        return res.view('whychoosers');
    });

    f.get('/worldmap', async (req, res) => {
        return res.view('worldmap');
    });

    f.get('/downloads', async (req, res) => {
        return res.view('downloads');
    });

    next();
}
