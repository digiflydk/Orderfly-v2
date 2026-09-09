'use server';
import { getFeedbackQuestionVersions as readVersions } from '../actions';
export async function getFeedbackQuestionVersions() { return readVersions(); }
