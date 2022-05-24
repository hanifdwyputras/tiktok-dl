import type {NextApiRequest, NextApiResponse} from 'next';
import ow from 'ow';
import {getProvider, Providers, BaseProvider} from 'tiktok-dl-core';
import {rotateProvider} from '../../lib/rotator';
import {ratelimitMiddleware} from '../../middleware/ratelimit';

export default async (req: NextApiRequest, res: NextApiResponse) => {
    try {
        await ratelimitMiddleware(req, res);
        const providersType = Providers.map((p) => p.resourceName());
        ow(
            req.method === 'POST' ? JSON.parse(req.body) : req.query,
            ow.object.partialShape({
                url: ow.string.url.validate((v) => ({
                    validator:
                        /^http(s?)(:\/\/)([a-z]+\.)*tiktok\.com\/(.*)$/gi.test(
                            v,
                        ),
                    message: 'Expected (.*).tiktok.com',
                })),
                type: ow.optional.string.validate((v) => ({
                    validator:
                        typeof v === 'string' &&
                        providersType.includes(v.toLowerCase()),
                    message:
                        'Invalid Provider, available provider is: ' +
                        Providers.map((x) => x.resourceName()).join(', '),
                })),
                nocache:
                    req.method === 'POST'
                        ? ow.optional.boolean
                        : ow.optional.string,
                rotateOnError:
                    req.method === 'POST'
                        ? ow.optional.boolean
                        : ow.optional.string,
            }),
        );

        let provider = getProvider(
            (req.query.type || req.body.type) ?? 'random',
        );
        if (!provider) {
            return res.status(400).json({
                error: 'Invalid provider',
                providers: providersType,
            });
        }

        const params = provider.getParams();
        if (
            params &&
            provider.resourceName() ===
                (req.query.type?.toString() || req.body.type)?.toLowerCase()
        ) {
            ow(req.query || req.body, ow.object.partialShape(params));
        } else if (params) {
            provider = getProvider('random');
        }

        const result = await rotateProvider(
            provider as BaseProvider,
            req.query.url || req.body.url,
            req.method === 'POST'
                ? req.body.rotateOnError
                : !!req.query.rotateOnError,
            params
                ? Object.fromEntries(
                      Object.keys(params!).map((p) => [
                          p,
                          (req.query[p] as string) ?? req.body[p],
                      ]),
                  )
                : {},
        );

        return res.status(200).json(result);
    } catch (e) {
        return res
            .status((e as Error).name === 'ArgumentError' ? 400 : 500)
            .json({
                error: (e as Error).name + '|' + (e as Error).message,
            });
    }
};
