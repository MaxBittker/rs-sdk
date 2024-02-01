import fs from 'fs';

export default function (f, opts, next) {
    f.get('/', async (req, res) => {
        return res.view('varrock/histories/index');
    });

    fs.readdirSync('view/varrock/histories')
        .filter(file => file != 'index.ejs')
        .forEach(file => {
            f.get('/' + file.replace('.ejs', ''), async (req, res) => {
                return res.view('varrock/histories/' + file);
            });
        });

    next();
}
