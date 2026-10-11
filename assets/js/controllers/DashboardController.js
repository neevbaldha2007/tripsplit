/**
 * TripSplit — Dashboard Controller
 * Manages trip overview, trip creation modal, editing, and deletion
 */

app.controller('DashboardController', ['$scope', '$rootScope', 'apiService', function($scope, $rootScope, apiService) {
    $scope.trips = [];
    $scope.loading = true;
    $scope.selectedTrip = null;

    // Form model for creating a new trip
    $scope.newTrip = {
        name: '',
        destination: '',
        start_date: '',
        end_date: '',
        memberInput: '',
        members: []
    };

    // Form model for editing an existing trip
    $scope.editTripData = {
        id: null,
        name: '',
        destination: '',
        start_date: '',
        end_date: ''
    };

    // Trip pending deletion
    $scope.tripToDelete = null;

    // Fetch all trips
    $scope.loadTrips = function() {
        $scope.loading = true;
        apiService.getTrips().then(function(response) {
            $scope.trips = response.data.data || [];
            $scope.loading = false;
        }).catch(function(error) {
            $scope.loading = false;
            const msg = error.data && error.data.message ? error.data.message : 'Failed to load trips. Make sure MySQL is running in XAMPP.';
            $rootScope.showToast(msg, 'danger');
        });
    };

    // Add member tag in new trip modal
    $scope.addInitialMember = function() {
        const name = ($scope.newTrip.memberInput || '').trim();
        if (!name) return;

        // Check duplicate
        const exists = $scope.newTrip.members.some(m => m.toLowerCase() === name.toLowerCase());
        if (exists) {
            $rootScope.showToast('Member already added in this list', 'warning');
            return;
        }

        $scope.newTrip.members.push(name);
        $scope.newTrip.memberInput = '';
    };

    $scope.onMemberKeydown = function($event) {
        if ($event.keyCode === 13) {
            $event.preventDefault();
            $scope.addInitialMember();
        }
    };

    $scope.removeInitialMember = function(index) {
        $scope.newTrip.members.splice(index, 1);
    };

    // Submit new trip
    $scope.createTrip = function() {
        if (!$scope.newTrip.name.trim() || !$scope.newTrip.destination.trim()) {
            $rootScope.showToast('Trip name and destination are required', 'warning');
            return;
        }

        // If user typed a member name in the input but didn't press Add, include it automatically
        if ($scope.newTrip.memberInput && $scope.newTrip.memberInput.trim()) {
            $scope.addInitialMember();
        }

        const payload = {
            name: $scope.newTrip.name.trim(),
            destination: $scope.newTrip.destination.trim(),
            start_date: $scope.newTrip.start_date || null,
            end_date: $scope.newTrip.end_date || null,
            members: $scope.newTrip.members
        };

        apiService.createTrip(payload).then(function(response) {
            $rootScope.showToast('Trip "' + payload.name + '" created successfully!', 'success');
            
            // Close Bootstrap modal
            const modalEl = document.getElementById('newTripModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            // Reset form
            $scope.newTrip = {
                name: '',
                destination: '',
                start_date: '',
                end_date: '',
                memberInput: '',
                members: []
            };

            $scope.loadTrips();
        }).catch(function(error) {
            const msg = error.data && error.data.message ? error.data.message : 'Error creating trip.';
            $rootScope.showToast(msg, 'danger');
        });
    };

    // Open edit modal
    $scope.openEditTripModal = function(trip, event) {
        if (event) event.stopPropagation();
        $scope.editTripData = {
            id: trip.id,
            name: trip.name,
            destination: trip.destination,
            start_date: trip.start_date || '',
            end_date: trip.end_date || ''
        };
        const modalEl = document.getElementById('editTripModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    // Save trip edits
    $scope.updateTrip = function() {
        if (!$scope.editTripData.name.trim() || !$scope.editTripData.destination.trim()) {
            $rootScope.showToast('Trip name and destination are required', 'warning');
            return;
        }

        apiService.updateTrip($scope.editTripData).then(function() {
            $rootScope.showToast('Trip updated successfully', 'success');
            const modalEl = document.getElementById('editTripModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }
            $scope.loadTrips();
        }).catch(function(error) {
            const msg = error.data && error.data.message ? error.data.message : 'Error updating trip.';
            $rootScope.showToast(msg, 'danger');
        });
    };

    // Prompt delete confirmation
    $scope.confirmDeleteTrip = function(trip, event) {
        if (event) event.stopPropagation();
        $scope.tripToDelete = trip;
        const modalEl = document.getElementById('deleteTripModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    // Execute delete trip
    $scope.executeDeleteTrip = function() {
        if (!$scope.tripToDelete) return;

        apiService.deleteTrip($scope.tripToDelete.id).then(function() {
            $rootScope.showToast('Trip "' + $scope.tripToDelete.name + '" deleted.', 'success');
            const modalEl = document.getElementById('deleteTripModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }
            $scope.tripToDelete = null;
            $scope.loadTrips();
        }).catch(function(error) {
            const msg = error.data && error.data.message ? error.data.message : 'Error deleting trip.';
            $rootScope.showToast(msg, 'danger');
        });
    };

    // Navigate to trip details
    $scope.openTrip = function(tripId, event) {
        if (event) event.stopPropagation();
        window.location.href = 'trip-details.html?id=' + tripId;
    };

    // Check if ?id=X or ?trip_id=X is present in URL
    const urlParams = new URLSearchParams(window.location.search);
    const paramId = urlParams.get('id') || urlParams.get('trip_id');
    if (paramId) {
        $scope.selectedTrip = parseInt(paramId, 10);
    }

    // Initial load
    $scope.loadTrips();
}]);
