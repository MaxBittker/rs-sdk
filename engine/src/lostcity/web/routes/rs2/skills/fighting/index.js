import fs from 'fs';

export default function (f, opts, next) {
    f.get('/', async (req, res) => {
        return res.view('rs2/skills/fighting/index');
    });

    fs.readdirSync('view/rs2/skills/fighting')
        .filter(file => file != 'index.ejs')
        .forEach(file => {
            f.get('/' + file.replace('.ejs', ''), async (req, res) => {
                return res.view('rs2/skills/fighting/' + file);
            });
        });

    next();
}
