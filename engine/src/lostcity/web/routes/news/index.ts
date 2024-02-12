import { db } from '#lostcity/db/query.js';
import Environment from '#lostcity/util/Environment.js';

function getOrdinalNum(value: number) {
    let selector;

    if (value <= 0) {
        selector = 4;
    } else if ((value > 3 && value < 21) || value % 10 > 3) {
        selector = 0;
    } else {
        selector = value % 10;
    }

    return value + ['th', 'st', 'nd', 'rd', ''][selector];
}

function niceDate(date: Date) {
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();

    const num = getOrdinalNum(day);
    return `${num} ${month} ${year}`;
}

export default function (f: any, opts: any, next: any) {
    f.get('/', async (req: any, res: any) => {
        if (!req.query.page) {
            req.query.page = 1;
        } else {
            req.query.page = parseInt(req.query.page);
        }

        const { cat, page } = req.query;

        const categories = await db.selectFrom('newspost_category').selectAll().execute();

        let newsposts = db.selectFrom('newspost').orderBy('id desc');

        let category = null;
        if (cat > 0) {
            category = await db.selectFrom('newspost_category').where('id', '=', cat).selectAll().executeTakeFirst();
            newsposts = newsposts.where('category_id', '=', cat);
        }

        const nextPage = await newsposts
            .offset(page * 17)
            .limit(1)
            .select('id')
            .execute();
        const more = nextPage.length > 0;

        if (page > 0) {
            newsposts = newsposts.offset((page - 1) * 17);
        }

        newsposts = newsposts.limit(17);

        return res.view('news/index', {
            category,
            page,
            more,
            categories,
            newsposts: await newsposts.selectAll().execute()
        });
    });

    f.get('/:id', async (req: any, res: any) => {
        const newspost = await db.selectFrom('newspost').where('id', '=', req.params.id).selectAll().executeTakeFirst();
        if (!newspost) {
            return res.redirect(302, '/news');
        }

        const category = await db.selectFrom('newspost_category').where('id', '=', newspost.category_id).selectAll().executeTakeFirst();
        const categories = await db.selectFrom('newspost_category').selectAll().execute();
        const prev = await db.selectFrom('newspost').where('id', '<', req.params.id).where('category_id', '=', newspost.category_id).orderBy('id', 'desc').select('id').executeTakeFirst();
        const next = await db.selectFrom('newspost').where('id', '>', req.params.id).where('category_id', '=', newspost.category_id).orderBy('id', 'asc').select('id').executeTakeFirst();

        return res.view('news/post', {
            newspost,
            category,
            date: niceDate(newspost.date),
            categories,
            prev,
            next
        });
    });

    f.get('/create', async (req: any, res: any) => {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        if (Environment.ADMIN_IP != ip) {
            return res.redirect('/');
        }

        const { post } = req.query;

        const categories = await db.selectFrom('newspost_category').selectAll().execute();

        if (typeof post !== 'undefined') {
            const newspost = await db.selectFrom('newspost').where('id', '=', post).selectAll().executeTakeFirst();
            if (newspost) {
                return res.view('news/create', {
                    categories,
                    date: niceDate(newspost.date),
                    post,
                    newspost
                });
            }
        }

        return res.view('news/create', {
            categories
        });
    });

    f.post('/create', async (req: any, res: any) => {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        if (Environment.ADMIN_IP != ip) {
            return res.redirect('/');
        }

        const { post, title, html, category } = req.body;

        if (typeof title === 'undefined' || !title.length ||
            typeof html === 'undefined' || !html.length ||
            typeof category === 'undefined' || !category.length) {
            return res.redirect('/news/create');
        }

        if (typeof post !== 'undefined') {
            // update post
            const updated = await db.updateTable('newspost').set({
                title,
                content: html,
                category_id: category
            }).where('id', '=', post).executeTakeFirst();

            if (updated.numChangedRows == 1n) {
                return res.redirect('/news/' + post);
            }
        } else {
            // add post
            const row = await db.insertInto('newspost').values({
                title,
                content: html,
                category_id: category
            }).executeTakeFirst();

            if (row.numInsertedOrUpdatedRows == 1n) {
                return res.redirect('/news/' + post);
            }
        }

        // failed to add/update post
        const categories = await db.selectFrom('newspost_category').selectAll().execute();

        return res.view('news/create', {
            categories,
            post,
            date: niceDate(new Date()),
            title,
            category,
            preview: html
        });
    });

    f.post('/preview', async (req: any, res: any) => {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        if (Environment.ADMIN_IP != ip) {
            return res.redirect('/');
        }

        const { post, title, html, category } = req.body;

        const categories = await db.selectFrom('newspost_category').selectAll().execute();

        if (typeof post !== 'undefined') {
            const newspost = await db.selectFrom('newspost').where('id', '=', post).selectAll().executeTakeFirst();
            if (newspost) {
                return res.view('news/create', {
                    categories,
                    post,
                    newspost,
                    date: niceDate(newspost.date),
                    title,
                    category,
                    preview: html
                });
            }
        }

        return res.view('news/create', {
            categories,
            post,
            date: niceDate(new Date()),
            title,
            category,
            preview: html
        });
    });

    next();
}
