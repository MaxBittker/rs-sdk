import WorldList from '#lostcity/engine/WorldList.js';

import Environment from '#lostcity/util/Environment.js';

export default function (f: any, opts: any, next: any) {
    f.get('/jav_config.ws', async (req: any, res: any) => {
        let address = (Environment.HTTPS_ENABLED ? 'https://' : 'http://') + Environment.PUBLIC_IP;
        if (Environment.ADDRESS_SHOWPORT) {
            if (Environment.HTTPS_ENABLED && Environment.WEB_PORT != 443 && Environment.WEB_PORT != 80) {
                address += ':' + Environment.WEB_PORT;
            } else if (!Environment.HTTPS_ENABLED && Environment.WEB_PORT != 80) {
                address += ':' + Environment.WEB_PORT;
            }
        }

        const config: string[] = [
            'viewerversion=100',
            `serverlist=${address}/serverlist.ws`,
            'loader_jar=loader.jar',
            'window_preferredwidth=774',
            'window_preferredheight=552',
            'applet_minwidth=789',
            'applet_minheight=532',
            'applet_maxwidth=5670',
            'applet_maxheight=2160'
        ];

        const localization: string[] = [
            'lang0=English',
            'ok=OK',
            'cancel=Cancel',
            'options=Options',
            'changes_on_restart=Your changes will take effect when you next start this program.',
            'copy_paste_url=Please copy and paste the following URL into your web browser',
            'err_create_advertising=Unable to create advertising',
            'err_create_target=Unable to create target applet',
            'err_downloading=Error downloading',
            'err_get_file=Error getting file',
            'err_save_file=Error saving file',
            'err_load_bc=Unable to load browsercontrol',
            'err_verify_bc=Unable to verify browsercontrol',
            'err_verify_bc64=Unable to verify browsercontrol64',
            'information=Information',
            'language=Language',
            'switchserver=Switch World',
            'loading_app=Loading application',
            'loading_app_resources=Loading application resources',
            'message=Message',
            'new_version=Launcher update available! Please visit the website to download the latest version.',
            'new_version_link=http://2004scape.org/downloads',
            'new_version_linktext=Open Homepage',
            'tandc=This game is copyright (c) 1999 - 2004 Jagex Ltd.\\Recreated and preserved in 2023.'
        ];
        config.push(...localization.map(x => 'msg=' + x));

        const servers: string[][] = [];
        for (const world of WorldList) {
            // legacy PCs are more likely to have issues with HTTPS
            const address = 'http:' + world.address.split(':')[1];

            servers.push([
                `[${world.id}.high]`,
                `title=2004Scape - World ${world.id} (${world.members ? 'Members' : 'Free'})`,
                `codebase=${address}`,
                `servername=World ${world.id} (${world.members ? 'Members' : 'Free'}), High Detail`,
                `param=nodeid=${10 + world.id - 1}`,
                `param=portoff=${world.portOffset}`,
                `param=free=${world.members ? 0 : 1}`,
                'param=lowmem=0'
            ]);

            servers.push([
                `[${world.id}.low]`,
                `title=2004Scape - World ${world.id} (${world.members ? 'Members' : 'Free'})`,
                `codebase=${address}`,
                `servername=World ${world.id} (${world.members ? 'Members' : 'Free'}), Low Detail`,
                `param=nodeid=${10 + world.id - 1}`,
                `param=portoff=${world.portOffset}`,
                `param=free=${world.members ? 0 : 1}`,
                'param=lowmem=1'
            ]);
        }
        config.push(...servers.flat());

        return config.join('\n');
    });

    f.get('/serverlist.ws', async (req: any, res: any) => {
        const list: string[] = [];

        for (const world of WorldList) {
            list.push(`${world.id}.high,true`);
            list.push(`${world.id}.low,true`);
        }

        return list.join('\n');
    });

    f.get('/banner', async (req: any, res: any) => {
        return res.view('banner');
    });

    f.get('/client', async (req: any, res: any) => {
        if (typeof req.query.detail == 'undefined' || !req.query.detail) {
            return res.redirect(302, '/detail');
        }

        if (typeof req.query.world == 'undefined' || !req.query.world) {
            return res.redirect(302, '/detail');
        }

        if (typeof req.query.method == 'undefined') {
            return res.redirect(302, '/detail');
        }

        const world = WorldList.find(x => x.id == req.query.world);
        if (!world) {
            return res.redirect(302, '/detail');
        }

        if (req.query.method == 0) {
            return res.view('webclient', {
                world,
                detail: req.query.detail,
                method: req.query.method
            });
        } else if (req.query.method == 1 || req.query.method == 2) {
            return res.view('javaclient', {
                world,
                detail: req.query.detail,
                method: req.query.method
            });
        } else {
            return res.redirect(302, '/');
        }
    });

    f.get('/client-inner', async (req: any, res: any) => {
        if (typeof req.query.detail == 'undefined' || !req.query.detail) {
            return;
        }

        if (typeof req.query.world == 'undefined' || !req.query.world) {
            return;
        }

        if (typeof req.query.method == 'undefined' || !req.query.method) {
            return;
        }

        const world = WorldList.find(x => x.id == req.query.world);
        if (!world) {
            return;
        }

        if (req.query.method == 0) {
            return res.view('webclient-inner', {
                world,
                detail: req.query.detail,
                method: req.query.method
            });
        } else if (req.query.method == 1 || req.query.method == 2) {
            return res.view('javaclient-inner', {
                world,
                detail: req.query.detail,
                method: req.query.method
            });
        } else {
            return res.redirect(302, '/');
        }
    });

    next();
}
