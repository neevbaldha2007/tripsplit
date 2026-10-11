/**
 * TripSplit — Trip Controller
 * Manages active trip details, tab routing, and member operations with financial integrity guards
 */

app.controller('TripController', ['$scope', '$rootScope', '$location', 'apiService', function($scope, $rootScope, $location, apiService) {
    $scope.currentTripId = null;
    $scope.trip = null;
    $scope.members = [];
    $scope.loading = true;
    $scope.activeTab = 'expenses'; // default active tab: 'expenses', 'balances', 'reports', 'members'

    // Member form models
    $scope.newMemberName = '';
    $scope.editMemberData = { id: null, name: '' };
    $scope.memberToDelete = null;

    // Read tripId immediately from URL or scope
    const urlParams = new URLSearchParams(window.location.search);
    const paramTripId = urlParams.get('id') || urlParams.get('trip_id');
    if (paramTripId) {
        $scope.currentTripId = parseInt(paramTripId, 10);
        $rootScope.currentTripId = $scope.currentTripId;
    }

    // Initialize from URL parameter or passed tripId
    $scope.init = function(tripId) {
        if (tripId) {
            $scope.currentTripId = parseInt(tripId, 10);
        } else if (!$scope.currentTripId) {
            const params = new URLSearchParams(window.location.search);
            const foundId = params.get('id') || params.get('trip_id');
            if (foundId) {
                $scope.currentTripId = parseInt(foundId, 10);
            }
        }

        if ($scope.currentTripId) {
            $rootScope.currentTripId = $scope.currentTripId;
            $scope.loadTripDetails();
            $scope.loadMembers();
            $scope.$broadcast('refreshExpenses');
            $scope.$broadcast('refreshBalances');
            $scope.$broadcast('refreshReports');
        }
    };


    // Load trip header data
    $scope.loadTripDetails = function() {
        if (!$scope.currentTripId) return;
        $scope.loading = true;

        apiService.getTrip($scope.currentTripId).then(function(res) {
            $scope.trip = res.data.data;
            $scope.loading = false;
        }).catch(function(err) {
            $scope.loading = false;
            $rootScope.showToast('Unable to load trip details', 'danger');
        });
    };

    // Load members
    $scope.loadMembers = function() {
        if (!$scope.currentTripId) return;

        apiService.getMembers($scope.currentTripId).then(function(res) {
            $scope.members = res.data.data || [];
            // Broadcast to child controllers (e.g., ExpenseController needs updated members)
            $scope.$broadcast('membersUpdated', $scope.members);
        }).catch(function(err) {
            $rootScope.showToast('Failed to load trip members', 'danger');
        });
    };

    // Switch view tabs
    $scope.setTab = function(tabName) {
        $scope.activeTab = tabName;
        if (tabName === 'balances') {
            $scope.$broadcast('refreshBalances');
        } else if (tabName === 'reports') {
            $scope.$broadcast('refreshReports');
        } else if (tabName === 'expenses') {
            $scope.$broadcast('refreshExpenses');
        }
    };

    // Add Member
    $scope.addMember = function() {
        const name = ($scope.newMemberName || '').trim();
        if (!name) {
            $rootScope.showToast('Please enter a valid member name', 'warning');
            return;
        }

        // Duplicate check on client
        const exists = $scope.members.some(m => m.name.toLowerCase() === name.toLowerCase());
        if (exists) {
            $rootScope.showToast('A member named "' + name + '" already exists in this trip', 'warning');
            return;
        }

        apiService.addMember({
            trip_id: $scope.currentTripId,
            name: name
        }).then(function(res) {
            $rootScope.showToast('Member "' + name + '" added successfully!', 'success');
            $scope.newMemberName = '';
            $scope.loadMembers();
            $scope.loadTripDetails();
        }).catch(function(err) {
            const msg = err.data && err.data.message ? err.data.message : 'Error adding member';
            $rootScope.showToast(msg, 'danger');
        });
    };

    // Open edit member modal
    $scope.openEditMember = function(member) {
        $scope.editMemberData = {
            id: member.id,
            name: member.name
        };
        const modalEl = document.getElementById('editMemberModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    // Save edited member
    $scope.updateMember = function() {
        const name = ($scope.editMemberData.name || '').trim();
        if (!name) {
            $rootScope.showToast('Member name cannot be empty', 'warning');
            return;
        }

        apiService.updateMember({
            id: $scope.editMemberData.id,
            name: name
        }).then(function() {
            $rootScope.showToast('Member updated successfully', 'success');
            const modalEl = document.getElementById('editMemberModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }
            $scope.loadMembers();
        }).catch(function(err) {
            const msg = err.data && err.data.message ? err.data.message : 'Error updating member';
            $rootScope.showToast(msg, 'danger');
        });
    };

    // Prompt member deletion
    $scope.confirmDeleteMember = function(member) {
        $scope.memberToDelete = member;
        const modalEl = document.getElementById('deleteMemberModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    // Execute member deletion (with safety verification)
    $scope.executeDeleteMember = function() {
        if (!$scope.memberToDelete) return;

        apiService.deleteMember($scope.memberToDelete.id).then(function() {
            $rootScope.showToast('Member "' + $scope.memberToDelete.name + '" removed.', 'success');
            const modalEl = document.getElementById('deleteMemberModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }
            $scope.memberToDelete = null;
            $scope.loadMembers();
            $scope.loadTripDetails();
        }).catch(function(err) {
            // Informative rejection message from backend
            const msg = err.data && err.data.message ? err.data.message : 'Cannot delete member with active transactions.';
            $rootScope.showToast(msg, 'danger');
        });
    };

    // Listen for financial actions that impact totals
    $scope.$on('tripDataChanged', function() {
        $scope.loadTripDetails();
        $scope.loadMembers();
    });

    // If currentTripId is known from URL, load immediately now that all methods are registered
    if ($scope.currentTripId) {
        $scope.init($scope.currentTripId);
    }
}]);
