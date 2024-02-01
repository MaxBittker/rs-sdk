import fs from 'fs';

export default function (f, opts, next) {
    f.get('/', async (req, res) => {
        return res.view('rs2/controls/index');
    });

    fs.readdirSync('view/rs2/controls')
        .filter(file => file != 'index.ejs')
        .forEach(file => {
            f.get('/' + file.replace('.ejs', ''), async (req, res) => {
                return res.view('rs2/controls/' + file);
            });
        });

    next();
}
