/**
 * TripSplit — API Service
 * Centralizes all AngularJS $http communications with PHP backend endpoints
 */

app.factory('apiService', ['$http', function($http) {
    const BASE_URL = 'api';

    return {
        // --- Trips ---
        getTrips: function() {
            return $http.get(BASE_URL + '/trips.php');
        },
        getTrip: function(id) {
            return $http.get(BASE_URL + '/trips.php?id=' + id);
        },
        createTrip: function(data) {
            return $http.post(BASE_URL + '/trips.php', data);
        },
        updateTrip: function(data) {
            return $http.put(BASE_URL + '/trips.php', data);
        },
        deleteTrip: function(id) {
            return $http.delete(BASE_URL + '/trips.php?id=' + id);
        },

        // --- Members ---
        getMembers: function(tripId) {
            return $http.get(BASE_URL + '/members.php?trip_id=' + tripId);
        },
        addMember: function(data) {
            return $http.post(BASE_URL + '/members.php', data);
        },
        updateMember: function(data) {
            return $http.put(BASE_URL + '/members.php', data);
        },
        deleteMember: function(id) {
            return $http.delete(BASE_URL + '/members.php?id=' + id);
        },

        // --- Expenses ---
        getExpenses: function(tripId, filters) {
            let url = BASE_URL + '/expenses.php?trip_id=' + tripId;
            if (filters) {
                if (filters.category) url += '&category=' + encodeURIComponent(filters.category);
                if (filters.payer_id) url += '&payer_id=' + encodeURIComponent(filters.payer_id);
                if (filters.search) url += '&search=' + encodeURIComponent(filters.search);
                if (filters.start_date) url += '&start_date=' + encodeURIComponent(filters.start_date);
                if (filters.end_date) url += '&end_date=' + encodeURIComponent(filters.end_date);
            }
            return $http.get(url);
        },
        getExpense: function(id) {
            return $http.get(BASE_URL + '/expenses.php?id=' + id);
        },
        createExpense: function(data) {
            return $http.post(BASE_URL + '/expenses.php', data);
        },
        updateExpense: function(data) {
            return $http.put(BASE_URL + '/expenses.php', data);
        },
        deleteExpense: function(id) {
            return $http.delete(BASE_URL + '/expenses.php?id=' + id);
        },

        // --- Balances & Settlements Calculation ---
        getBalances: function(tripId) {
            return $http.get(BASE_URL + '/balances.php?trip_id=' + tripId);
        },

        // --- Settlements Record ---
        getSettlements: function(tripId) {
            return $http.get(BASE_URL + '/settlements.php?trip_id=' + tripId);
        },
        recordSettlement: function(data) {
            return $http.post(BASE_URL + '/settlements.php', data);
        },
        updateSettlement: function(data) {
            return $http.put(BASE_URL + '/settlements.php', data);
        },
        deleteSettlement: function(id) {
            return $http.delete(BASE_URL + '/settlements.php?id=' + id);
        }
    };
}]);
