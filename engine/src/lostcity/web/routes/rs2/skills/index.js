import fs from 'fs';

export default function (f, opts, next) {
    f.get('/', async (req, res) => {
        return res.view('rs2/skills/index');
    });

    fs.readdirSync('view/rs2/skills')
        .filter(file => file != 'index.ejs' && file != 'fighting')
        .forEach(file => {
            f.get('/' + file.replace('.ejs', ''), async (req, res) => {
                return res.view('rs2/skills/' + file);
            });
        });

    next();
}
