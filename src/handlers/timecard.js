import Boomify from 'boom';
import Boom from 'boom';
import { lastPayPeriod, currentPayPeriod } from '../utils/payperiod';
import { userExists, getEntriesForPayPeriod, payPeriodSubmitted, submitTimecard, getUser, getSubmission } from '../utils/database';

const functions = Object.create({});

functions.submit = async (request, h) => {

    let submission = request.payload;
    const userId = request.params.userId;

    const server = require('../server.js');

    try {

        if (!(await userExists(userId))) {
            return Boom.notFound('User does not exist.');
        }

        const prevPayPeriod = await lastPayPeriod();
        const currPayPeriod = await currentPayPeriod();

        const entriesSnapshot = await getEntriesForPayPeriod(userId, prevPayPeriod);

        // Handles new users, and users that have not submitted time entries for an entire pay period or longer
        if (entriesSnapshot.empty) {

            const currentPPSubmission = await getSubmission(userId, currPayPeriod);

            if (currentPPSubmission === null) { // First submission for current pay period
                submission = await submitTimecard(userId, (currPayPeriod), submission);
                return h.response().code(201);
            }

            const submissionId = currentPPSubmission.id;
            await server.db.collection('timecards').doc(submissionId).update(submission);
            return h.response().code(200);
        }

        // Check if user has already submitted timecard for previous pay period
        const prevPPSubmitted = await payPeriodSubmitted(userId, prevPayPeriod);
        if (prevPPSubmitted) {

            const currentPPSubmission = await getSubmission(userId, currPayPeriod);

            if (currentPPSubmission === null) { // First submission for current pay period
                submission = await submitTimecard(userId, (currPayPeriod), submission);
                return h.response().code(201);
            }

            const submissionId = currentPPSubmission.id;
            await server.db.collection('timecards').doc(submissionId).update(submission);
            return h.response().code(200);
        }

        // Submitting timecard for previous pay period
        submission = await submitTimecard(userId, prevPayPeriod, submission);
        return h.response(submission).code(201);
    }
    catch (error) {
        console.log(error);
        return new Boomify(error);
    }
};

functions.getTimecards = async (request, h) => {

    const userIds = JSON.parse(request.params.userIds);

    const period = {
        startDate: request.params.startDate,
        endDate: request.params.endDate
    };

    try {
        const timecards = [];

        for (let i = 0; i < userIds.length; ++i) {
            const id = userIds[i];
            const user = await getUser(id);

            if (user !== null) {

                const timecard = {
                    firstName: user.firstName,
                    lastName: user.lastName,
                    entries: [[], [], [], [], [], [], []]
                };

                // Get current user's entries for requested period
                // Incase date from params needs to be parsed to Date object...
                period.startDate = new Date(period.startDate);
                period.endDate = new Date(period.endDate);
                const entriesSnapshot = await getEntriesForPayPeriod(id, period);

                if (!(entriesSnapshot.empty)) {

                    const entries = entriesSnapshot.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));

                    // Go through each entry and format for pdf
                    entries.forEach((entry) => {

                        const timecardEntry = {};

                        // Set client name and job/job description
                        if (entry.jobType === 'Construction' || entry.jobType === 'Other') {
                            timecardEntry.clientName = entry.job.clientName;
                            timecardEntry.job = entry.job.address;
                            timecardEntry.jobNumber = entry.job.jobNumber;
                        }
                        else {
                            timecardEntry.clientName = '';
                            timecardEntry.job = entry.job;
                            timecardEntry.jobNumber = '';
                        }

                        // Type filed for pdf
                        const costCode = entry.costCode;
                        if (costCode !== null) {
                            timecardEntry.type = `${costCode.description} (${costCode.code})`;
                        }
                        else {
                            timecardEntry.type =  '';
                        }

                        timecardEntry.timeWorked = entry.timeWorked;

                        // Add entry to bucket corresponding to the day of the week worked
                        // Firebase stores Date objects as Timestamps
                        const day = entry.jobDate.toDate().getDay();
                        timecard.entries[day].push(timecardEntry);
                    });
                }
                else {
                    timecard.entries = null;
                }

                const injuredSub = await getSubmission(id, period);
                if (injuredSub === null) {
                    timecard.injured = null;
                }
                else {
                    timecard.injured = injuredSub.injured;
                }

                timecards.push(timecard);
            }
        }

        return h.response(timecards);
    }
    catch (error) {
        return new Boomify(error);
    }
};

export default functions;
