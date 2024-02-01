import fs from 'fs';

export default function (f, opts, next) {
    f.get('/', async (req, res) => {
        return res.view('rs2/quests/index');
    });

    fs.readdirSync('view/rs2/quests')
        .filter(file => file != 'index.ejs')
        .forEach(file => {
            f.get('/' + file.replace('.ejs', ''), async (req, res) => {
                return res.view('rs2/quests/' + file);
            });
        });

    next();
}
