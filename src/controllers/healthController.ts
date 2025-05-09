import { Request, Response } from 'express';

export const testRoute = (req: Request, res: Response) => {
  console.log('[ROUTE] test route invoked');
  res.status(200).send('Server test route is working!');
};

export const rootRoute = (req: Request, res: Response) => {
  res.send('TV Show API Server - Test Mode');
}; 