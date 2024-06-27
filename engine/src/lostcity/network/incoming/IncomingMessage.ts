import ClientProtCategory from '#lostcity/network/incoming/prot/ClientProtCategory.js';

export default abstract class IncomingMessage {
    readonly abstract category: ClientProtCategory;
}
